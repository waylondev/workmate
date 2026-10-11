package org.waylon.workmate.skill

import io.agentscope.core.skill.AgentSkill
import io.agentscope.core.skill.repository.AgentSkillRepository
import org.waylon.workmate.agent.AgentCatalog
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

/**
 * SKILL 管理薄层：复用官方 [AgentSkillRepository]（由 HarnessAgent 持有）。
 *
 * <p>技能目录约定：`workspace/skills/<skillName>/SKILL.md`，由官方 `WorkspaceSkillRepository`
 * 通过 glob 发现。本控制器通过 [AgentCatalog] 拿到 agent 绑定的 skill 仓库，暴露「列表 / 详情 / 删除」。
 *
 * <p>删除为非破坏性（官方把目录移到 `.archive/<name>-<ts>/`）。新增/编辑技能可通过写
 * `workspace/skills/<name>/SKILL.md` 文件实现（后续增强再暴露写接口）。
 */
@RestController
@RequestMapping("/api")
class SkillController(
	private val catalog: AgentCatalog,
) {

	/** 列出某个 agent 可见的所有技能名称。 */
	@GetMapping("/agents/{agentId}/skills")
	fun listSkills(@PathVariable agentId: String): List<Map<String, Any?>> {
		val agent = catalog.agents[agentId]
			?: return emptyList()
		return agent.skillRepositories
			.flatMap { repo -> repo.allSkills.map { skill -> skillSummary(agentId, repo, skill) } }
	}

	/** 从某个 agent 删除一个技能（非破坏性，移到 .archive）。 */
	@DeleteMapping("/agents/{agentId}/skills/{skillName}")
	fun deleteSkill(@PathVariable agentId: String, @PathVariable skillName: String): Map<String, Any> {
		val agent = catalog.agents[agentId]
			?: return mapOf("agentId" to agentId, "skillName" to skillName, "deleted" to false, "error" to "agent not found")
		val deleted = agent.skillRepositories.any { it.delete(skillName) }
		return mapOf(
			"agentId" to agentId,
			"skillName" to skillName,
			"deleted" to deleted,
		)
	}

	private fun skillSummary(agentId: String, repo: AgentSkillRepository, skill: AgentSkill): Map<String, Any?> =
		mapOf(
			"agentId" to agentId,
			"name" to skill.name,
			"description" to skill.description,
			"source" to repo.source,
		)
}
