package org.waylon.workmate.job

import com.fasterxml.jackson.annotation.JsonCreator
import com.fasterxml.jackson.annotation.JsonProperty

/**
 * 一次定时任务触发的执行记录。
 *
 * <p>由 [ExecutionRecordingHook] 在每次触发时捕获：开始时间（首次事件到达）、结束时间、
 * 状态（`success` / `failed`）、模型输出文本与 token 用量。字段为可空以兼容「事件只到达一半」
 * 的异常场景（例如模型调用超时、进程被杀），保证序列化不失败。
 */
data class JobExecution @JsonCreator constructor(
	@JsonProperty("jobName") val jobName: String,
	@JsonProperty("startedAt") val startedAt: Long,
	@JsonProperty("finishedAt") val finishedAt: Long?,
	@JsonProperty("status") val status: String,
	@JsonProperty("output") val output: String?,
	@JsonProperty("error") val error: String?,
	@JsonProperty("inputTokens") val inputTokens: Long?,
	@JsonProperty("outputTokens") val outputTokens: Long?,
)
