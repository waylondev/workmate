package org.waylon.workmate.agent

import io.agentscope.core.agui.registry.AguiAgentRegistry
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

/**
 * Agent 专家管理薄层：复用官方 [AguiAgentRegistry]（支持运行时 register/unregister）。
 *
 * <p>当前 agent 定义仍来自 `workmate.agents` 配置（[AgentCatalog] 启动期构建并注册）。
 * 本控制器暴露「已注册 agent 列表」与「注销」，用于观察与运行时移除。
 *
 * <p>「运行时新增 agent」需要 [AgentCatalog] 支持动态构建（传入新的 AgentProperties + Model），
 * 属后续增强；当前先打通「列表 + 注销」这条确定无误的链路。
 */
@RestController
@RequestMapping("/api/agents")
class AgentAdminController(
	private val registry: AguiAgentRegistry,
	private val catalog: AgentCatalog,
) {

	/** 列出已注册的 agent（id + name + description）。 */
	@GetMapping
	fun listAgents(): List<Map<String, String>> =
		catalog.agents.map { (id, agent) ->
			mapOf(
				"id" to id,
				"name" to agent.name,
				"description" to (agent.description ?: ""),
			)
		}

	/** 运行时注销一个 agent（从 agui registry 移除；agent 定义仍在 catalog，可重新注册）。 */
	@DeleteMapping("/{agentId}")
	fun unregisterAgent(@PathVariable agentId: String): Map<String, Any> {
		val removed = registry.unregister(agentId)
		return mapOf(
			"agentId" to agentId,
			"unregistered" to removed,
		)
	}
}
