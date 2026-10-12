package org.waylon.workmate.session

import org.waylon.workmate.agent.AgentCatalog
import org.waylon.workmate.web.ApiException
import org.springframework.stereotype.Service
import java.nio.file.Files
import java.nio.file.Path
import java.util.Comparator
import kotlin.io.path.exists
import kotlin.io.path.name

/**
 * 会话管理服务：列出 / 删除某个 agent 的会话。
 *
 * <h2>为什么不用官方 API</h2>
 * AgentScope 官方**没有**「列出全部会话 / 删除会话」的管理面 API。会话是运行时内部状态，
 * 按 `(agentId, threadId)` 命名空间隔离、由 SessionTree 落盘到
 * `{workspace}/{threadId}/agents/{AgentName}/sessions/`。官方 `WorkspaceManager.listSessionLogFiles`
 * 是命名空间相关的（`RuntimeContext` 决定 `agents` 目录的相对位置），用空上下文拿不到跨
 * threadId 的数据，不适合管理面。
 *
 * <p>因此本服务直接操作磁盘目录：`{workspace}/{threadId}/` 即一个会话的完整落盘单元
 * （转录 `.jsonl` + 事件流 `events/`）。`workspace` 取自 [AgentCatalog] 里 agent 的官方
 * `HarnessAgent.workspaceManager.workspace`（公开 getter，非实现细节）；`threadId` 即前端
 * AG-UI 的会话隔离键（本项目契约：`threadId` 同时是落盘目录名）。
 *
 * <h2>删除语义</h2>
 * 删除 = 删掉 `{workspace}/{threadId}/` 整个目录，**不可逆**，前端应如实提示。
 */
@Service
class SessionAdminService(
	private val catalog: AgentCatalog,
) {

	/** 列出某 agent 的全部会话目录（按目录修改时间倒序）。 */
	fun list(agentId: String): List<SessionView> {
		val workspace = workspace(agentId)
		if (!workspace.exists()) return emptyList()
		return Files.list(workspace).use { stream ->
			stream
				.filter { Files.isDirectory(it) && !isSpecialDir(it) }
				.map { dir ->
					SessionView(
						agentId = agentId,
						sessionId = dir.name,
						agentName = agentName(agentId),
						updatedAt = lastModifiedMillis(dir),
					)
				}
				.sorted(Comparator.comparingLong(SessionView::updatedAt).reversed())
				.toList()
		}
	}

	/**
	 * 删除单个会话的整个落盘目录。
	 *
	 * @throws ApiException 404 会话目录不存在
	 */
	fun delete(agentId: String, sessionId: String): SessionDeletion {
		val workspace = workspace(agentId)
		val target = workspace.resolve(sessionId).normalize()

		// 防目录穿越：target 必须严格在 workspace 之内
		if (!target.startsWith(workspace) || target == workspace) {
			throw ApiException.badRequest("非法会话 id：$sessionId")
		}
		if (!target.exists() || !Files.isDirectory(target)) {
			throw ApiException.notFound("session not found: $sessionId (agent=$agentId)")
		}

		val removedFiles = countFiles(target)
		Files.walk(target).use { stream ->
			stream.sorted(Comparator.reverseOrder()).forEach(Files::delete)
		}

		return SessionDeletion(
			agentId = agentId,
			sessionId = sessionId,
			deleted = true,
			removedFiles = removedFiles,
		)
	}

	private fun workspace(agentId: String): Path =
		catalog.agents[agentId]?.workspaceManager?.workspace
			?: throw ApiException.notFound("agent not found: $agentId")

	private fun agentName(agentId: String): String =
		catalog.agents[agentId]?.name ?: agentId

	/** workspace 下的特殊目录（非会话目录）不列入。 */
	private fun isSpecialDir(dir: Path): Boolean =
		dir.name in setOf("skills", "knowledge", "memory", "agents", "default")

	private fun lastModifiedMillis(path: Path): Long = try {
		Files.getLastModifiedTime(path).toMillis()
	} catch (_: Exception) {
		0L
	}

	private fun countFiles(dir: Path): Int = try {
		Files.walk(dir).use { stream -> stream.filter { Files.isRegularFile(it) }.count().toInt() }
	} catch (_: Exception) {
		0
	}
}

/** 会话列表项。 */
data class SessionView(
	val agentId: String,
	/** 即前端 AG-UI 的 threadId，也是落盘目录名。 */
	val sessionId: String,
	/** 会话所属 agent 名。 */
	val agentName: String,
	/** 目录最后修改时间（epoch millis）。 */
	val updatedAt: Long,
)

/** 删除结果。 */
data class SessionDeletion(
	val agentId: String,
	val sessionId: String,
	val deleted: Boolean,
	/** 本次删除的文件数量。 */
	val removedFiles: Int,
)
