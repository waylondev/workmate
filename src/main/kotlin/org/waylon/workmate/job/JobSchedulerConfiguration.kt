package org.waylon.workmate.job

import io.agentscope.core.message.Msg
import io.agentscope.core.model.Model
import io.agentscope.extensions.scheduler.AgentScheduler
import io.agentscope.extensions.scheduler.ScheduleAgentTask
import io.agentscope.extensions.scheduler.config.AgentConfig
import io.agentscope.extensions.scheduler.config.ModelConfig
import io.agentscope.extensions.scheduler.config.ScheduleConfig
import io.agentscope.extensions.scheduler.quartz.QuartzAgentScheduler
import org.waylon.workmate.agent.WorkmateProperties
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

/**
 * 定时任务调度：复用官方 scheduler-quartz 扩展（栈无关，纯 Java，无 Spring 依赖）。
 *
 * <p>官方 `agentscope-extensions-scheduler` 是聚合 POM（无 jar），实际代码在
 * `agentscope-extensions-scheduler-quartz`。核心接口 [AgentScheduler]，实现 [QuartzAgentScheduler]。
 *
 * <p>由于官方扩展无自动配置，这里手动装配成 Spring Bean。任务定义（cron + 目标 agent）持久化
 * 后续增强；当前先打通「注册 / 取消 / 列表」链路。
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
	fun jobSchedulerService(
		scheduler: AgentScheduler,
		model: Model,
		properties: WorkmateProperties,
	): JobSchedulerService = JobSchedulerService(scheduler, model, properties)
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
 */
class JobSchedulerService(
	private val scheduler: AgentScheduler,
	private val model: Model,
	private val properties: WorkmateProperties,
) {

	/**
	 * 注册一个 cron 定时任务：到点以指定 agent 的 sysPrompt 跑一次模型调用。
	 *
	 * @param jobName 任务名（全局唯一，用作取消标识；同时作为定时 agent 的 name）
	 * @param agentId `workmate.agents` 中的 key，取其 sysPrompt 作为定时 agent 的人设
	 * @param cronExpression Quartz cron 表达式（如 "0 0 8 * * ?"）
	 */
	// 官方 Java 侧 AgentScheduler 的签名是裸类型（泛型被擦除），Kotlin 只能看到 ScheduleAgentTask<*>。
	// 唯一实现 BaseScheduleAgentTask 声明为 implements ScheduleAgentTask<Msg>，故此处收窄是安全的。
	@Suppress("UNCHECKED_CAST")
	fun schedule(
		jobName: String,
		agentId: String,
		cronExpression: String,
	): ScheduleAgentTask<Msg> {
		val declared = requireNotNull(properties.agents[agentId]) {
			"agent not found: $agentId"
		}

		val agentConfig = AgentConfig.builder()
			.name(jobName)
			.sysPrompt(declared.sysPrompt)
			.modelConfig(SharedModelConfig(model))
			.build()

		// mode 由显式调用的方法决定：cron(...) 即 ScheduleMode.CRON
		val scheduleConfig = ScheduleConfig.builder()
			.cron(cronExpression)
			.build()

		return scheduler.schedule(agentConfig, scheduleConfig) as ScheduleAgentTask<Msg>
	}

	fun cancel(jobName: String): Boolean = scheduler.cancel(jobName)

	@Suppress("UNCHECKED_CAST")
	fun list(): List<ScheduleAgentTask<Msg>> =
		scheduler.allScheduleAgentTasks as List<ScheduleAgentTask<Msg>>
}
