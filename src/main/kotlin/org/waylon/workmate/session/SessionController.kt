package org.waylon.workmate.session

import io.agentscope.spring.boot.agui.common.ThreadSessionManager
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.time.Instant

/**
 * 会话管理薄层：复用官方 [ThreadSessionManager] Bean（agui-starter 自动注册），
 * 不引入数据库、不自造存储。
 *
 * <p>两个层次的会话概念必须分清，否则接口会误导调用方：
 * - **转录持久化**：官方 `SessionTree` 按 `agents/{agentId}/sessions/{sessionId}.jsonl` 落盘，
 *   append-only，进程重启后仍在（每个 agent workspace 下）。
 * - **服务端会话池**：本接口访问的 [ThreadSessionManager]，维护内存中的
 *   `threadId → agent 实例` 槽位，用于同一 threadId 的多次请求复用 agent 与上下文；**进程内有效**，
 *   且按 LRU 淘汰，因此它只是诊断视图，不是「用户全部会话列表」。
 *
 * <p>历史实现的 `GET /api/sessions` 只回 `{"activeSessions": n}`，语义不明且看起来「恒为 0」；
 * 现在返回明细，调用方可以直接看到池里到底有谁。
 */
@RestController
@RequestMapping("/api/sessions")
class SessionController(
	private val sessionManager: ThreadSessionManager,
) {

	/**
	 * 内存会话池快照。
	 *
	 * @return `activeSessions` 为池内会话数，`sessions` 为明细（threadId / userId / agentId / 时间）
	 */
	@GetMapping
	fun listSessions(): Map<String, Any?> {
		val sessions = sessionManager.sessions.values.map { session ->
			SessionView(
				threadId = session.threadId,
				userId = session.userId,
				agentId = session.agentId,
				name = session.name,
				createdAt = session.createdAt,
				lastAccess = session.lastAccess,
				archived = session.isArchived,
			)
		}
		return mapOf(
			"activeSessions" to sessionManager.sessionCount,
			"sessions" to sessions,
		)
	}

	/**
	 * 从内存池移除一个会话槽（幂等）。转录 JSONL 由 `SessionTree` 管理，不在本接口职责内。
	 *
	 * @return `removed=false` 表示池中本就没有该 threadId（例如已被淘汰，或从未在服务端发起过请求）
	 */
	@DeleteMapping("/{threadId}")
	fun deleteSession(@PathVariable threadId: String): Map<String, Any> = mapOf(
		"threadId" to threadId,
		"removed" to sessionManager.removeSession(threadId),
	)
}

/** 内存会话池中的一条会话。 */
data class SessionView(
	val threadId: String,
	val userId: String,
	val agentId: String,
	val name: String?,
	val createdAt: Instant?,
	val lastAccess: Instant?,
	val archived: Boolean,
)
