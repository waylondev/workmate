package org.waylon.workmate.session

import io.agentscope.spring.boot.agui.common.ThreadSessionManager
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

/**
 * 会话管理薄层：复用官方 [ThreadSessionManager] Bean（agui-starter 自动注册），
 * 不引入数据库、不自造存储。
 *
 * <p>会话内容（对话历史）由官方 `SessionTree` 按 `agents/{agentId}/sessions/{sessionId}.jsonl`
 * 自动持久化；本控制器只暴露「会话列表 / 删除」等管理能力。
 *
 * <p>注意：`ThreadSessionManager` 是「服务端内存池」——维护 `threadId → agent 实例` 的映射，
 * 用于在同一 threadId 的多次请求间复用 agent、保留对话历史。会话的**文件持久化**在 harness 的
 * `SessionTree` 层。二者配合：AG-UI 请求带 threadId → ThreadSessionManager 按 threadId 复用 agent →
 * agent 内部 SessionTree 按 (agentId, sessionId) 读写 JSONL。
 */
@RestController
@RequestMapping("/api/sessions")
class SessionController(
	private val sessionManager: ThreadSessionManager,
) {

	/**
	 * 删除一个会话（按 threadId）。返回是否确实删除了某个会话。
	 * 会话的 JSONL 文件由 SessionTree 管理，此处删除的是内存池中的会话槽。
	 */
	@DeleteMapping("/{threadId}")
	fun deleteSession(@PathVariable threadId: String): Map<String, Any> {
		val removed = sessionManager.removeSession(threadId)
		return mapOf(
			"threadId" to threadId,
			"removed" to removed,
		)
	}

	/**
	 * 当前内存池中的会话数量（不代表持久化会话总数，仅诊断用）。
	 */
	@GetMapping
	fun sessionCount(): Map<String, Any> = mapOf(
		"activeSessions" to sessionManager.sessionCount,
	)
}
