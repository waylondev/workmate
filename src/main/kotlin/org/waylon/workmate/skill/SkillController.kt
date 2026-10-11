package org.waylon.workmate.skill

import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

/**
 * SKILL 管理薄层。
 *
 * <p>全部逻辑在 [SkillAdminService]（仓库选择、写开关、归档语义），本类只做 HTTP 映射。
 * 错误统一走 `ApiExceptionHandler` 的 RFC 7807 契约：agent/技能不存在 → 404，只读无法删除 → 409。
 */
@RestController
@RequestMapping("/api/agents/{agentId}/skills")
class SkillController(
	private val skills: SkillAdminService,
) {

	/** 列出某 agent 可见的全部技能（含来源仓库、可写性、删除语义）。 */
	@GetMapping
	fun listSkills(@PathVariable agentId: String): List<SkillView> = skills.list(agentId)

	/**
	 * 删除一个技能。官方 workspace 仓库为**归档**语义（移到 `skills/.archive/<name>-<ts>`），
	 * 响应中的 `archived` 字段如实反映本次是归档还是硬删除。
	 */
	@DeleteMapping("/{skillName}")
	fun deleteSkill(
		@PathVariable agentId: String,
		@PathVariable skillName: String,
	): SkillDeletion = skills.delete(agentId, skillName)
}
