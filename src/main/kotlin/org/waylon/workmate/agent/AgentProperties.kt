package org.waylon.workmate.agent

import io.agentscope.core.permission.PermissionMode
import io.agentscope.harness.agent.tools.ToolsConfig
import java.nio.file.Path

/**
 * 单个 agent 的配置，对应 `workmate.agents.<id>`。
 *
 * <p>未显式设置的项一律沿用 HarnessAgent 官方默认值（记忆、上下文压缩、transcript、会话持久化、
 * 技能、子智能体、内置工具均默认启用），此处只暴露需要按 agent 调整的旋钮。
 */
data class AgentProperties(
	val name: String,
	/**
	 * agent 简介，用于管理接口展示与子智能体目录。留空时回退为 [name]——
	 * 不设置时 `HarnessAgent` 会生成 `Agent(<uuid>) Name` 这类无意义描述。
	 */
	val description: String = "",
	val sysPrompt: String,
	/** agent 工作区，同时作为权限上下文的工作目录。 */
	val workspace: Path,
	/**
	 * 官方 [PermissionMode] 语义：
	 * - `default`：所有操作都需显式 allow 规则（未命中即走 AG-UI `permission_confirm` 审批）
	 * - `accept-edits`：工作目录内的编辑自动放行
	 * - `explore`：只读，修改类工具被拒
	 * - `bypass`：全部放行
	 * - `dont-ask`：ASK 降级为 DENY，用于无人值守
	 */
	val permissionMode: PermissionMode = PermissionMode.DEFAULT,
	val maxIters: Int = 10,
	val maxContextTokens: Int = 8_000,
	val enablePlanMode: Boolean = false,
	val enableTracingLog: Boolean = true,
	/**
	 * 是否开启「技能自管理」：agent 可创建技能草稿、晋升为正式技能。
	 * 对应官方 `HarnessAgent$Builder.enableSkillManageTool(SkillManageConfig)`，采用官方 `defaults()`，
	 * **不覆盖任何字段**——即 `autoPromote=false`（草稿需 promotionGate 审批才转正）、
	 * `securityScan=false`、`mainDir="skills"`、`draftsDir="skills/_drafts"`。
	 */
	val enableSkillManageTool: Boolean = false,
	/**
	 * 是否开启「技能策展」：定期对技能做自动生命周期迁移（stale/archive）。
	 * 对应官方 `HarnessAgent$Builder.enableSkillCurator(SkillCuratorConfig)`，采用官方 `defaults()`，
	 * **不覆盖任何字段**——即 `intervalHours=168`、`staleAfterDays=30`、`archiveAfterDays=90`、
	 * `umbrellaPassMode=DRY_RUN_ONLY`（默认只演练报告、不实际归档）。
	 */
	val enableSkillCurator: Boolean = false,
	/**
	 * 声明式工具配置，官方 [ToolsConfig] JavaBean，Spring 直接绑定。
	 *
	 * <p>核心字段 `mcpServers: Map<String, McpServerConfig>` 即「连接器」：每个 entry 是一个 MCP
	 * server，`McpServerConfig` 用 `transport`（stdio/sse/streamableHttp）+ `command`/`args`/`env`
	 * （stdio）或 `url`/`headers`（sse/streamableHttp）声明。传给
	 * `HarnessAgent$Builder.toolsConfig(...)` 后，官方 `McpServerRegistrar` 会**自动构建
	 * `McpClientBuilder` + `buildSync()` + 注册**，无需手动 new 任何组件。
	 *
	 * <p>MCP 是 per-agent 的：每个 [HarnessAgent] 持有独立的 `ownedMcpToolkit`，互不共享。
	 */
	val toolsConfig: ToolsConfig? = null,
)
