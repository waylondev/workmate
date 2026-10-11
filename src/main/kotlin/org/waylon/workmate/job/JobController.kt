package org.waylon.workmate.job

import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

/**
 * 定时任务管理薄层：复用官方 scheduler-quartz 扩展，见 [JobSchedulerService] 的语义说明。
 *
 * <p>错误契约与其它业务接口一致（RFC 7807）：参数不合法 → 400、agent 不存在 → 404、
 * 任务名重复 → 409。历史实现把「agent 不存在」当成 HTTP 200 + `{"error": ...}` 返回，
 * 前端会把失败当成功（表单被清空且无任何提示）。
 */
@RestController
@RequestMapping("/api/jobs")
class JobController(
	private val jobSchedulerService: JobSchedulerService,
) {

	/** 注册一个 cron 定时任务。body: `{ name, agentId, cronExpression }` */
	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	fun createJob(@RequestBody body: CreateJobRequest): JobView =
		jobSchedulerService.schedule(body.name, body.agentId, body.cronExpression)

	/** 列出所有定时任务（含目标 agent、cron 与已触发次数）。 */
	@GetMapping
	fun listJobs(): List<JobView> = jobSchedulerService.list()

	/** 取消一个定时任务（幂等）。 */
	@DeleteMapping("/{jobName}")
	fun cancelJob(@PathVariable jobName: String): JobCancellation =
		JobCancellation(name = jobName, cancelled = jobSchedulerService.cancel(jobName))
}

data class CreateJobRequest(
	val name: String,
	val agentId: String,
	val cronExpression: String,
)

/** 定时任务列表项。 */
data class JobView(
	val name: String,
	/** 官方任务对象 id（调度器内部标识）。 */
	val id: String,
	val agentId: String,
	val cron: String,
	/** 已触发次数。 */
	val executions: Long,
)

/** 取消结果。 */
data class JobCancellation(
	val name: String,
	val cancelled: Boolean,
)
