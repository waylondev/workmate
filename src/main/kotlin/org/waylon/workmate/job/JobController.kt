package org.waylon.workmate.job

import org.waylon.workmate.agent.AgentCatalog
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

/**
 * 定时任务管理薄层：复用官方 scheduler-quartz 扩展。
 *
 * <p>任务定义（cron + 目标 agent）当前存内存（后续增强可持久化到 JSON 文件）。
 * 到点触发由官方调度器新建 agent 执行，见 [JobSchedulerService] 的语义说明。
 */
@RestController
@RequestMapping("/api/jobs")
class JobController(
	private val jobSchedulerService: JobSchedulerService,
	private val catalog: AgentCatalog,
) {

	/** 注册一个 cron 定时任务。body: { name, agentId, cronExpression } */
	@PostMapping
	fun createJob(@RequestBody body: CreateJobRequest): Map<String, Any> {
		if (body.agentId !in catalog.agents) {
			return mapOf("error" to "agent not found: ${body.agentId}")
		}

		val task = jobSchedulerService.schedule(body.name, body.agentId, body.cronExpression)
		return mapOf(
			"name" to task.name,
			"id" to task.id,
			"scheduled" to true,
		)
	}

	/** 列出所有已注册的定时任务。 */
	@GetMapping
	fun listJobs(): List<Map<String, String>> =
		jobSchedulerService.list().map { task ->
			mapOf(
				"name" to task.name,
				"id" to task.id,
			)
		}

	/** 取消一个定时任务。 */
	@DeleteMapping("/{jobName}")
	fun cancelJob(@PathVariable jobName: String): Map<String, Any> =
		mapOf(
			"name" to jobName,
			"cancelled" to jobSchedulerService.cancel(jobName),
		)
}

data class CreateJobRequest(
	val name: String,
	val agentId: String,
	val cronExpression: String,
)
