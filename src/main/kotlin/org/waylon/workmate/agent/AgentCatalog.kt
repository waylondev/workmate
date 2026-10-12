package org.waylon.workmate.agent

import io.agentscope.core.agui.registry.AguiAgentRegistry
import io.agentscope.core.model.Model
import io.agentscope.core.permission.AdditionalWorkingDirectory
import io.agentscope.core.permission.PermissionMode
import io.agentscope.core.permission.PermissionContextState
import io.agentscope.harness.agent.HarnessAgent
import io.agentscope.harness.agent.skill.curator.SkillCuratorConfig
import io.agentscope.harness.agent.tool.SkillManageConfig
import io.agentscope.harness.agent.tools.ToolsConfig
import org.springframework.beans.factory.DisposableBean

/**
 * 按 `workmate.agents.<id>` 构造并持有全部 [HarnessAgent] 单例。
 *
 * <p>HarnessAgent 无状态、按 `(userId, sessionId)` 隔离，可安全单例复用；集中持有是为了在容器关闭
 * 时统一 close，避免 Toolkit / WorkspaceManager / state store 泄漏。
 *
 * <p>agent 通过 [registerAll] 注册到 AG-UI 注册表（`/agui/run/{id}` 路由）。注册表只有
 * `hasAgent` / `unregister`，没有「列出」能力，因此**枚举 agent 一律以本类的 catalog 为准**，
 * 注册态由 `registry.hasAgent(id)` 单独查询（见 `AgentAdminController`）。
 */
class AgentCatalog(
	model: Model,
	properties: WorkmateProperties,
) : DisposableBean {

	val agents: Map<String, HarnessAgent> =
		properties.agents.mapValues { (id, config) -> build(id, config, model) }

	/** agent id → 权限模式。供管理面展示，避免把「权限」硬编码在前端。 */
	val permissionModes: Map<String, PermissionMode> =
		properties.agents.mapValues { (_, config) -> config.permissionMode }

	/** 把全部 agent 注册进 AG-UI 注册表（启动期调用）。 */
	fun registerAll(registry: AguiAgentRegistry) =
		agents.forEach { (id, agent) -> registry.register(id, agent) }

	/**
	 * 把指定 agent 注册进 AG-UI 注册表。
	 *
	 * @return 该 id 是否存在于 catalog
	 */
	fun register(registry: AguiAgentRegistry, agentId: String): Boolean {
		val agent = agents[agentId] ?: return false
		registry.register(agentId, agent)
		return true
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
			// 必须显式给描述：官方缺省会生成 `Agent(<uuid>) Name` 这类无意义字符串
			.description(config.description.ifBlank { config.name })
			.sysPrompt(config.sysPrompt)
			.model(model)
			.workspace(workspace)
			.maxIters(config.maxIters)
			.maxContextTokens(config.maxContextTokens)
			.enableAgentTracingLog(config.enableTracingLog)
			.permissionContext(permission)
			.enablePlanMode(config.enablePlanMode)
			.apply {
				configureSkills(config)
				configureTools(config)
			}
			.build()
	}

	/**
	 * 按配置接入官方 Skill 生命周期能力（自建技能 + 策展）。
	 *
	 * <p>官方 `HarnessAgent$Builder` 在调用这两个开关后会**自动装配**整条链路
	 * （`SkillManageTool` / `ProposeSkillTool` / `SkillUsageMiddleware` / `SkillPromoter` /
	 * `SkillCurator` / `SkillCuratorMiddleware`），我们只负责传官方 `defaults()`，
	 * **不覆盖任何字段、不手动 new 任何组件**。
	 */
	private fun HarnessAgent.Builder.configureSkills(config: AgentProperties) {
		if (config.enableSkillManageTool) {
			enableSkillManageTool(SkillManageConfig.defaults())
		}
		if (config.enableSkillCurator) {
			enableSkillCurator(SkillCuratorConfig.defaults())
		}
	}

	/**
	 * 按配置接入官方 MCP「连接器」（声明式 `ToolsConfig.mcpServers`）。
	 *
	 * <p>官方 `HarnessAgent$Builder.toolsConfig(...)` 接收 [ToolsConfig]，其中 `mcpServers` 是
	 * `Map<String, McpServerConfig>`。交给官方后，`McpServerRegistrar` 会按每个 config 的
	 * `transport`（stdio/sse/streamableHttp）**自动构建 `McpClientBuilder` + `buildSync()` +
	 * 注册进该 agent 的 `ownedMcpToolkit`**，无需手动 new 任何组件。
	 *
	 * <p>MCP 是 per-agent 的，多个 agent 各配各的、互不共享。
	 */
	private fun HarnessAgent.Builder.configureTools(config: AgentProperties) {
		config.toolsConfig?.let { toolsConfig(it) }
	}
}
