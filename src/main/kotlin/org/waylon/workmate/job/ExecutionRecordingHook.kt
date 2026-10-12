package org.waylon.workmate.job

import io.agentscope.core.hook.ErrorEvent
import io.agentscope.core.hook.Hook
import io.agentscope.core.hook.HookEvent
import io.agentscope.core.hook.HookEventType
import io.agentscope.core.hook.PostCallEvent
import reactor.core.publisher.Mono

/**
 * 记录定时任务执行结果的官方 [Hook] 实现。
 *
 * <p>官方 scheduler-quartz 每次触发都会 `ReActAgent.builder().hooks(...)` 新建 agent，但传入的
 * [Hook] 列表来自 [RuntimeAgentConfig]，是**跨触发共享的同一个实例**。因此本 Hook 不能持有
 * 「单次触发」的跨调用状态（否则多次触发会被上一次的标记污染，只记录第一条）。
 *
 * <p>据此，这里采用**无状态**实现：每到达一次 [HookEventType.POST_CALL] 或 [HookEventType.ERROR]
 * 就落盘一条独立记录。对定时任务（sysPrompt 单轮触发）而言，一次触发即一次 POST_CALL，语义正确；
 * 若某次触发发生多轮 ReAct（多次模型调用），则对应多条记录——这如实反映执行过程，比「只记最后一轮」
 * 更不易丢信息。
 *
 * <p>时间取事件自带的 `timestamp`（毫秒），开始与结束同一值（单事件无法拆出更细粒度）。
 */
class ExecutionRecordingHook(
	private val jobName: String,
	private val store: JobExecutionStore,
) : Hook {

	override fun <T : HookEvent> onEvent(event: T): Mono<T> {
		when (event.type) {
			HookEventType.POST_CALL -> recordSuccess(event as? PostCallEvent)
			HookEventType.ERROR -> recordError(event as? ErrorEvent)
			else -> Unit
		}
		return Mono.just(event)
	}

	private fun recordSuccess(event: PostCallEvent?) {
		val msg = event?.finalMessage ?: return
		val usage = msg.usage
		store.append(
			JobExecution(
				jobName = jobName,
				startedAt = event.timestamp,
				finishedAt = event.timestamp,
				status = "success",
				output = msg.textContent,
				error = null,
				inputTokens = usage?.inputTokens?.toLong(),
				outputTokens = usage?.outputTokens?.toLong(),
			),
		)
	}

	private fun recordError(event: ErrorEvent?) {
		val err = event?.error
		store.append(
			JobExecution(
				jobName = jobName,
				startedAt = event?.timestamp ?: System.currentTimeMillis(),
				finishedAt = event?.timestamp ?: System.currentTimeMillis(),
				status = "failed",
				output = null,
				error = err?.message ?: err?.javaClass?.simpleName ?: "unknown",
				inputTokens = null,
				outputTokens = null,
			),
		)
	}
}
