package org.waylon.workmate.skill

import io.agentscope.core.skill.repository.AgentSkillRepository
import io.agentscope.harness.agent.skill.WorkspaceSkillRepository
import org.waylon.workmate.agent.AgentCatalog
import org.waylon.workmate.web.ApiException
import org.springframework.stereotype.Service

/**
 * 技能管理服务：在官方 [AgentSkillRepository] 之上提供「列表 / 删除」。
 *
 * <p>技能目录约定：`<agent workspace>/skills/<name>/SKILL.md`，由官方仓库扫描发现。
 *
 * <h2>为什么删除需要临时打开写开关</h2>
 * 官方 `HarnessAgentBuilderSupport.composeSkillRepositories` 会按顺序装配仓库：
 * 1. `projectGlobalSkillsDir` 对应的 `FileSystemSkillRepository`（若配置）
 * 2. builder 显式传入的仓库
 * 3. `<workspace>/skills` 的 `FileSystemSkillRepository`（**仅当构建期该目录已存在**）
 * 4. `WorkspaceSkillRepository(filesystem, "skills", "workspace-namespaced", writable = false)` —— **恒为只读**
 *
 * 因此运行期新建的技能目录只有第 4 个仓库看得见，而它 `writable=false`，`delete()` 会直接
 * 记一条 `is currently read-only; delete() ignored` 并返回 false —— 这正是历史上
 * `DELETE /api/agents/{id}/skills/{name}` 返回 `deleted:false` 且文件不动的根因。
 *
 * <p>修复方式：删除时**在调用期间**把目标仓库置为可写，`finally` 还原。官方把
 * `setWriteable(boolean)` 暴露在 [AgentSkillRepository] 接口上，即为这种「外部管理面」预留；
 * 还原是为了不改变 agent 运行时的默认保护姿态。
 *
 * <h2>删除语义</h2>
 * - `WorkspaceSkillRepository`：**归档**到 `skills/.archive/<name>-<ts>`，优先选用
 * - `FileSystemSkillRepository`：**硬删除**，仅在上面那个仓库不包含该技能时回退使用
 *
 * <p>注意：官方 `AgentSkillRepository` 只有 `save`/`delete`，**没有恢复（unarchive）也没有启停
 * 开关**；`delete()` 内部用「move 到 `.archive/`」只是避免直接删除的兜底，并非承诺可逆。
 * 因此本项目**不提供**技能恢复接口——删除即不可逆，前端应如实提示。
 *
 * <p>响应如实回传 `archived`，避免接口文档与真实行为不一致。
 */
@Service
class SkillAdminService(
	private val catalog: AgentCatalog,
) {

	/** 列出某 agent 全部可见技能。同一技能被多个仓库提供时合并为一行，并列出全部来源。 */
	fun list(agentId: String): List<SkillView> {
		val agent = agent(agentId)

		return agent.skillRepositories
			.flatMap { repo -> repo.allSkills.map { skill -> repo to skill } }
			.groupBy { (_, skill) -> skill.name }
			.map { (name, entries) ->
				val repositories = entries.map { (repo, _) -> repoView(repo) }
				val containing = entries.map { (repo, _) -> repo }.distinct()
				SkillView(
					agentId = agentId,
					name = name,
					description = entries.first().second.description,
					repositories = repositories,
					deletable = selectForDelete(containing) != null,
				)
			}
			.sortedBy(SkillView::name)
	}

	/**
	 * 删除一个技能。
	 *
	 * @throws ApiException 404 技能不存在；409 仓库只读导致无法删除
	 */
	fun delete(agentId: String, skillName: String): SkillDeletion {
		val agent = agent(agentId)
		val containing = agent.skillRepositories.filter { it.skillExists(skillName) }
		if (containing.isEmpty()) {
			throw ApiException.notFound("skill not found: $skillName (agent=$agentId)")
		}

		val target = selectForDelete(containing)
			?: throw ApiException.conflict(
				"skill '$skillName' 所在的仓库均为只读，无法删除：${containing.map { it.source }}",
			)

		val wasWritable = target.isWriteable
		try {
			if (!wasWritable) target.setWriteable(true)
			if (!target.delete(skillName)) {
				throw ApiException.conflict("skill '$skillName' 删除失败：仓库 ${target.source} 拒绝写入")
			}
		} finally {
			if (!wasWritable) target.setWriteable(false)
		}

		return SkillDeletion(
			agentId = agentId,
			skillName = skillName,
			deleted = true,
			repository = target.source,
			archived = target is WorkspaceSkillRepository,
		)
	}

	private fun agent(agentId: String) = catalog.agents[agentId]
		?: throw ApiException.notFound("agent not found: $agentId")

	/**
	 * 选出实际执行删除的仓库：
	 * 1. 归档语义的 workspace 仓库优先
	 * 2. 其次任意声明可写的仓库（硬删除）
	 * 3. 都没有 → null（无法删除）
	 */
	private fun selectForDelete(containing: List<AgentSkillRepository>): AgentSkillRepository? =
		containing.firstOrNull { it is WorkspaceSkillRepository }
			?: containing.firstOrNull { it.isWriteable }

	private fun repoView(repo: AgentSkillRepository): SkillRepositoryView {
		val info = repo.repositoryInfo
		return SkillRepositoryView(
			source = repo.source,
			type = info.type,
			location = info.location,
			writable = info.isWritable,
			archivedOnDelete = repo is WorkspaceSkillRepository,
		)
	}
}

/** 技能列表项，按技能名去重后聚合来源仓库。 */
data class SkillView(
	val agentId: String,
	val name: String,
	val description: String?,
	val repositories: List<SkillRepositoryView>,
	/** 是否可删除（存在归档仓库或可写仓库）。 */
	val deletable: Boolean,
)

/** 提供该技能的仓库描述。 */
data class SkillRepositoryView(
	val source: String,
	val type: String,
	val location: String,
	val writable: Boolean,
	/** 该仓库的 delete 语义是归档（可恢复）还是硬删除。 */
	val archivedOnDelete: Boolean,
)

/** 删除结果。 */
data class SkillDeletion(
	val agentId: String,
	val skillName: String,
	val deleted: Boolean,
	/** 实际执行删除的仓库 source。 */
	val repository: String,
	/** true=已归档到 `.archive/`（官方 delete 的兜底，非承诺可恢复）；false=硬删除。 */
	val archived: Boolean,
)
