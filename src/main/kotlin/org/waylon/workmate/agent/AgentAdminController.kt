package org.waylon.workmate.agent

import io.agentscope.core.agui.registry.AguiAgentRegistry
import org.waylon.workmate.web.ApiException
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

/**
 * Agent 专家管理薄层：复用官方 [AguiAgentRegistry]（支持运行时 register / unregister）。
 *
 * <p>agent **定义**来自 `workmate.agents` 配置（[AgentCatalog] 启动期构建），本控制器只切换
 * 「是否注册到 AG-UI 路由」这一运行时状态，不新增/修改定义。
 *
 * <p>两个来源必须分清，否则管理界面会说谎：
 * - 枚举 agent → [AgentCatalog]（注册表没有列出能力，只提供 `hasAgent`）
 * - 注册状态 → `registry.hasAgent(id)`
 *
 * <p>因此列表同时返回 `registered`；注销是**可逆**的，用 [registerAgent] 恢复。
 */
@RestController
@RequestMapping("/api/agents")
class AgentAdminController(
	private val registry: AguiAgentRegistry,
	private val catalog: AgentCatalog,
) {

	/** 列出 catalog 中的全部 agent 及其当前注册状态。 */
	@GetMapping
	fun listAgents(): List<AgentView> = catalog.agents.keys.map(::view)

	/**
	 * 运行时注销一个 agent：从 AG-UI 注册表移除后，`/agui/run/{id}` 将不再可达。
	 * 幂等——重复注销返回同一结果态，不报错。
	 */
	@DeleteMapping("/{agentId}")
	fun unregisterAgent(@PathVariable agentId: String): AgentView {
		if (agentId !in catalog.agents) throw ApiException.notFound("agent not found: $agentId")
		registry.unregister(agentId)
		return view(agentId)
	}

	/** 重新注册一个已注销的 agent，恢复 `/agui/run/{id}` 路由。 */
	@PostMapping("/{agentId}/register")
	fun registerAgent(@PathVariable agentId: String): AgentView {
		if (!catalog.register(registry, agentId)) throw ApiException.notFound("agent not found: $agentId")
		return view(agentId)
	}

	private fun view(agentId: String): AgentView {
		val agent = requireNotNull(catalog.agents[agentId])
		return AgentView(
			id = agentId,
			name = agent.name,
			description = agent.description ?: "",
			registered = registry.hasAgent(agentId),
		)
	}
}

/** agent 列表项：定义信息 + 运行时注册状态。 */
data class AgentView(
	val id: String,
	val name: String,
	val description: String,
	val registered: Boolean,
)
