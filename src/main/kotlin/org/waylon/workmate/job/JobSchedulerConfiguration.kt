package org.waylon.workmate.job

import io.agentscope.core.message.Msg
import io.agentscope.core.model.Model
import io.agentscope.extensions.scheduler.AgentScheduler
import io.agentscope.extensions.scheduler.BaseScheduleAgentTask
import io.agentscope.extensions.scheduler.ScheduleAgentTask
import io.agentscope.extensions.scheduler.config.ModelConfig
import io.agentscope.extensions.scheduler.config.RuntimeAgentConfig
import io.agentscope.extensions.scheduler.config.ScheduleConfig
import io.agentscope.extensions.scheduler.quartz.QuartzAgentScheduler
import org.quartz.CronExpression
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.waylon.workmate.agent.WorkmateProperties
import org.waylon.workmate.web.ApiException
import java.util.concurrent.ConcurrentHashMap

/**
 * 定时任务调度：复用官方 scheduler-quartz 扩展（栈无关，纯 Java，无 Spring 依赖）。
 *
 * <p>官方 `agentscope-extensions-scheduler` 是聚合 POM（无 jar），实际代码在
 * `agentscope-extensions-scheduler-quartz`。核心接口 [AgentScheduler]，实现 [QuartzAgentScheduler]。
 *
 * <p>由于官方扩展无自动配置，这里手动装配成 Spring Bean。任务定义经 [JobDefinitionStore]
 * 落盘到 `.agentscope/jobs.json`（运行态数据，重启后恢复）。
 */
@Configuration(proxyBeanMethods = false)
class JobSchedulerConfiguration {

	@Bean(destroyMethod = "shutdown")
	fun agentScheduler(): AgentScheduler =
		QuartzAgentScheduler.builder()
			.schedulerId("workmate-scheduler")
			.autoStart(true)
			.build()

	@Bean
	fun jobDefinitionStore(): JobDefinitionStore =
		JobDefinitionStore(JOB_DEFINITIONS_FILE)

	@Bean
	fun jobExecutionStore(): JobExecutionStore =
		JobExecutionStore(JOB_EXECUTIONS_FILE)

	@Bean
	fun jobSchedulerService(
		scheduler: AgentScheduler,
		model: Model,
		properties: WorkmateProperties,
		store: JobDefinitionStore,
		executionStore: JobExecutionStore,
	): JobSchedulerService = JobSchedulerService(scheduler, model, properties, store, executionStore)

	private companion object {
		/** 任务定义落盘位置：运行态数据，随 `.agentscope/` 一起被 `.gitignore` 忽略。 */
		val JOB_DEFINITIONS_FILE: java.nio.file.Path =
			java.nio.file.Path.of(".agentscope", "jobs.json")

		/** 执行历史落盘位置：同上，运行态数据。 */
		val JOB_EXECUTIONS_FILE: java.nio.file.Path =
			java.nio.file.Path.of(".agentscope", "job-executions.json")
	}
}

/**
 * 把应用已装配的 [Model] 适配成官方 scheduler 的 [ModelConfig]。
 *
 * <p>官方 `scheduler-common` 只自带 `DashScopeModelConfig`，OpenAI 兼容端点需自行适配。
 * `RuntimeAgentConfig.Builder#modelConfig` 在 `build()` 前会调用 [createModel]，因此这里直接
 * 返回同一个 [Model] 实例，无需重建连接。
 */
class SharedModelConfig(
	private val model: Model,
) : ModelConfig {

	override fun getModelName(): String = model.modelName

	override fun createModel(): Model = model
}

/**
 * 定时任务服务：把官方 [AgentScheduler] 包装成业务可用的调度能力。
 *
 * <p>**触发语义**：官方 `BaseScheduleAgentTask` 在每次触发时用 `ReActAgent.builder()` 新建一个
 * 轻量 agent（`name` + `sysPrompt` + `model` + 可选 `toolkit/hooks`），**不接受外部传入的 agent
 * 实例**。因此这里复用的是「agent 的声明」（`workmate.agents.<id>` 的 sysPrompt）与应用级
 * [Model]，而不是 [org.waylon.workmate.agent.AgentCatalog] 里那个 `HarnessAgent` 实例——
 * 定时任务不享有 workspace / 记忆 / 技能 / 权限引擎。
 *
 * <p>**任务定义**：官方 [ScheduleAgentTask] 只保留任务名与调度配置，不记录目标 agentId，故本类
 * 额外维护一份 `name → 定义` 映射，作为「任务列表」投影的真实来源。
 */
class JobSchedulerService(
	private val scheduler: AgentScheduler,
	private val model: Model,
	private val properties: WorkmateProperties,
	private val store: JobDefinitionStore,
	private val executionStore: JobExecutionStore,
) {

	private val definitions = ConcurrentHashMap<String, JobDefinition>()

	private val log = org.slf4j.LoggerFactory.getLogger(JobSchedulerService::class.java)

	init {
		// 进程重启后恢复：把持久化的任务定义重新注册回 Quartz（Quartz 本身是内存态）
		store.load().forEach { def -> reschedule(def) }
	}

	/**
	 * 注册一个 cron 定时任务：到点以指定 agent 的 sysPrompt 跑一次模型调用。
	 *
	 * @param jobName 任务名（全局唯一，用作取消标识；同时作为定时 agent 的 name）
	 * @param agentId `workmate.agents` 中的 key，取其 sysPrompt 作为定时 agent 的人设
	 * @param cronExpression Quartz cron 表达式（如 `0 0 8 * * ?`）
	 * @throws ApiException 400 参数不合法 / 404 agent 不存在 / 409 任务名重复
	 */
	fun schedule(jobName: String, agentId: String, cronExpression: String): JobView {
		val name = jobName.trim()
		if (name.isEmpty()) throw ApiException.badRequest("job name must not be blank")
		if (agentId.isBlank()) throw ApiException.badRequest("agentId must not be blank")

		val declared = properties.agents[agentId]
			?: throw ApiException.notFound("agent not found: $agentId")

		// 先校验 cron，避免把非法表达式带进 Quartz（历史上会以未处理异常变成 500）
		val cron = cronExpression.trim()
		if (!CronExpression.isValidExpression(cron)) {
			throw ApiException.badRequest("invalid Quartz cron expression: $cronExpression")
		}

		if (definitions.containsKey(name) || scheduler.getScheduledAgent(name) != null) {
			throw ApiException.conflict("job already exists: $name")
		}

		// 用 RuntimeAgentConfig（而非基类 AgentConfig）以注入官方 Hook：scheduler 内部
		// 只有在收到 RuntimeAgentConfig 时才会保留 hooks，否则会丢（基类无 hooks 字段）。
		// ExecutionRecordingHook 在每次触发时捕获输出与 token，写入执行历史。
		val agentConfig = RuntimeAgentConfig.builder()
			.name(name)
			.sysPrompt(declared.sysPrompt)
			.modelConfig(SharedModelConfig(model))
			.hooks(listOf(ExecutionRecordingHook(name, executionStore)))
			.build()

		// mode 由显式调用的方法决定：cron(...) 即 ScheduleMode.CRON
		val scheduleConfig = ScheduleConfig.builder()
			.cron(cron)
			.build()

		// 官方 Java 侧 AgentScheduler 的签名是裸类型（泛型被擦除），Kotlin 只能看到 ScheduleAgentTask<*>。
		// 唯一实现 BaseScheduleAgentTask 声明为 implements ScheduleAgentTask<Msg>，故此处收窄是安全的。
		@Suppress("UNCHECKED_CAST")
		val task = scheduler.schedule(agentConfig, scheduleConfig) as ScheduleAgentTask<Msg>

		definitions[name] = JobDefinition(name = name, agentId = agentId, cron = cron)
		persist()

		return JobView(
			name = name,
			id = task.id,
			agentId = agentId,
			cron = cron,
			executions = executionCount(name),
		)
	}

	/** 取消任务（幂等）：不存在时返回 false，不报错。取消时一并清理执行历史。 */
	fun cancel(jobName: String): Boolean {
		val name = jobName.trim()
		val cancelled = scheduler.cancel(name)
		if (definitions.remove(name) != null) {
			persist()
			executionStore.remove(name)
		}
		return cancelled
	}

	/** 返回某任务的执行历史（新的在前）。任务不存在时返回空列表（不报错）。 */
	fun listExecutions(jobName: String): List<JobExecution> =
		executionStore.list(jobName.trim())

	/** 列出全部任务：以本服务的定义为主，同时纳入调度器中存在但定义缺失的任务（不隐藏）。 */
	@Suppress("UNCHECKED_CAST")
	fun list(): List<JobView> {
		val tasks = scheduler.allScheduleAgentTasks
			.associateBy { it.name }

		val names = LinkedHashSet<String>().apply {
			addAll(definitions.keys)
			addAll(tasks.keys)
		}

		return names.map { name ->
			val def = definitions[name]
			val task = tasks[name]
			val schedule = (task as? BaseScheduleAgentTask)?.scheduleConfig
			JobView(
				name = name,
				id = task?.id ?: "",
				agentId = def?.agentId ?: "",
				cron = def?.cron ?: schedule?.cronExpression ?: "",
				executions = executionCount(name),
			)
		}.sortedBy(JobView::name)
	}

	/** 已触发次数。官方仅在 [BaseScheduleAgentTask] 上暴露该计数。 */
	private fun executionCount(jobName: String): Long =
		(scheduler.getScheduledAgent(jobName) as? BaseScheduleAgentTask)?.executionCount ?: 0L

	/** 把持久化的定义重新注册回 Quartz（启动恢复用）。恢复失败只记日志，不阻断启动。 */
	private fun reschedule(def: JobDefinition) {
		val declared = properties.agents[def.agentId] ?: run {
			log.warn("skip restoring job '{}': agent '{}' no longer declared", def.name, def.agentId)
			return
		}
		try {
			val agentConfig = RuntimeAgentConfig.builder()
				.name(def.name)
				.sysPrompt(declared.sysPrompt)
				.modelConfig(SharedModelConfig(model))
				.hooks(listOf(ExecutionRecordingHook(def.name, executionStore)))
				.build()
			val scheduleConfig = ScheduleConfig.builder().cron(def.cron).build()
			@Suppress("UNCHECKED_CAST")
			scheduler.schedule(agentConfig, scheduleConfig) as ScheduleAgentTask<Msg>
			definitions[def.name] = def
		} catch (e: Exception) {
			log.warn("skip restoring job '{}': {}", def.name, e.message)
		}
	}

	/** 把当前定义快照落盘。 */
	private fun persist() {
		try {
			store.save(definitions.values.toList())
		} catch (e: Exception) {
			// 落盘失败不应破坏已注册成功的任务；记日志，任务仍在本进程内可用
			log.error("failed to persist job definitions", e)
		}
	}
}

