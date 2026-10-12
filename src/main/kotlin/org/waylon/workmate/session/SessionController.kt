package org.waylon.workmate.session

import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

/**
 * 会话管理薄层：在官方 WorkspaceManager 之上暴露「列出 / 删除」真实会话。
 *
 * <p>全部逻辑在 [SessionAdminService]，本类只做 HTTP 映射。错误统一走 `ApiExceptionHandler`
 * 的 RFC 7807 契约：agent 不存在 → 404，会话不存在 → 404。
 */
@RestController
@RequestMapping("/api/agents/{agentId}/sessions")
class SessionController(
	private val sessions: SessionAdminService,
) {

	/** 列出某 agent 的全部真实会话（来自服务端转录落盘）。 */
	@GetMapping
	fun listSessions(@PathVariable agentId: String): List<SessionView> = sessions.list(agentId)

	/** 删除单个会话的转录文件（不可逆）。 */
	@DeleteMapping("/{sessionId}")
	fun deleteSession(
		@PathVariable agentId: String,
		@PathVariable sessionId: String,
	): SessionDeletion = sessions.delete(agentId, sessionId)
}
