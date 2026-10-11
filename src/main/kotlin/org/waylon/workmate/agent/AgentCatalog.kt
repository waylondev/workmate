package org.waylon.workmate.agent

import io.agentscope.core.model.Model
import io.agentscope.core.permission.AdditionalWorkingDirectory
import io.agentscope.core.permission.PermissionContextState
import io.agentscope.harness.agent.HarnessAgent
import io.agentscope.spring.boot.admin.registry.AgentRegistry
import jakarta.annotation.PostConstruct
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.DisposableBean
import org.springframework.beans.factory.ObjectProvider

/**
 * 按 `workmate.agents.<id>` 构造并持有全部 [HarnessAgent] 单例。
 *
 * <p>HarnessAgent 无状态、按 `(userId, sessionId)` 隔离，可安全单例复用；集中持有是为了在容器关闭
 * 时统一 close，避免 Toolkit / WorkspaceManager / state store 泄漏。
 *
 * <p>官方 [AgentRegistry] 约定：AgentScope 的 agent 不是单例 bean，应用侧需在构造长生命周期 agent
 * 后主动注册；admin starter 关闭时该 bean 不存在，因此用 [ObjectProvider] 可选注入。
 */
class AgentCatalog(
	model: Model,
	properties: WorkmateProperties,
	private val adminRegistry: ObjectProvider<AgentRegistry>,
) : DisposableBean {

	private val log = LoggerFactory.getLogger(AgentCatalog::class.java)

	val agents: Map<String, HarnessAgent> =
		properties.agents.mapValues { (id, config) -> build(id, config, model) }

	@PostConstruct
	fun registerToAdmin() {
		adminRegistry.ifAvailable?.let { registry ->
			agents.values.forEach(registry::register)
			log.info("Registered {} agent(s) to AgentScope admin: {}", agents.size, agents.keys)
		}
	}

	override fun destroy() = agents.values.forEach(HarnessAgent::close)

	private fun build(id: String, config: AgentProperties, model: Model): HarnessAgent {
		val workspace = config.workspace.toAbsolutePath().normalize()

		// 官方 isTrivial()：mode=DEFAULT 且无工作目录、无规则时退回「仅工具自检」的轻量路径，
		// 配置的 permission-mode（即 AG-UI 的 permission_confirm 审批）将不参与判定；
		// 登记工作目录以启用完整权限引擎，并让 ACCEPT_EDITS 能在工作区内自动放行。
		val permission = PermissionContextState.builder()
			.mode(config.permissionMode)
			.addWorkingDirectory(
				"workspace",
				AdditionalWorkingDirectory(workspace.toString(), "userSettings"),
			)
			.build()

		return HarnessAgent.builder()
			.agentId(id)
			.name(config.name)
			.sysPrompt(config.sysPrompt)
			.model(model)
			.workspace(workspace)
			.maxIters(config.maxIters)
			.maxContextTokens(config.maxContextTokens)
			.enableAgentTracingLog(config.enableTracingLog)
			.permissionContext(permission)
			.enablePlanMode(config.enablePlanMode)
			.build()
	}
}
