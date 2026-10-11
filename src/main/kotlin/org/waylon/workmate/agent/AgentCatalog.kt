package org.waylon.workmate.agent

import io.agentscope.core.model.Model
import io.agentscope.core.permission.AdditionalWorkingDirectory
import io.agentscope.core.permission.PermissionContextState
import io.agentscope.harness.agent.HarnessAgent
import org.springframework.beans.factory.DisposableBean

/**
 * 按 `workmate.agents.<id>` 构造并持有全部 [HarnessAgent] 单例。
 *
 * <p>HarnessAgent 无状态、按 `(userId, sessionId)` 隔离，可安全单例复用；集中持有是为了在容器关闭
 * 时统一 close，避免 Toolkit / WorkspaceManager / state store 泄漏。
 *
 * <p>agent 通过 [AgentConfiguration.aguiAgentRegistrar] 注册到 AG-UI 注册表（`/agui/run/{id}` 路由）。
 * 已移除对 `agentscope-admin`（MVC 运维面板）的依赖。
 */
class AgentCatalog(
	model: Model,
	properties: WorkmateProperties,
) : DisposableBean {

	val agents: Map<String, HarnessAgent> =
		properties.agents.mapValues { (id, config) -> build(id, config, model) }

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
