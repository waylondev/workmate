package org.waylon.workmate.agent

import io.agentscope.core.permission.PermissionMode
import org.springframework.boot.context.properties.ConfigurationProperties
import java.nio.file.Path

/**
 * 业务侧 harness agent 配置，对应 `workmate.agent.*`。
 *
 * <p>未显式设置的项一律沿用 HarnessAgent 官方默认值（记忆、压缩、transcript、会话持久化、
 * 技能、子智能体、内置工具均默认启用），此处只暴露需要按环境调整的旋钮。
 */
@ConfigurationProperties("workmate.agent")
data class AgentProperties(
	val name: String,
	val sysPrompt: String,
	/** agent 工作区，会同时作为权限上下文的工作目录。 */
	val workspace: Path,
	/** `default` 时非只读工具会触发 AG-UI HITL 审批；`bypass` 全部放行。 */
	val permissionMode: PermissionMode = PermissionMode.DEFAULT,
	val maxIters: Int = 10,
	val maxContextTokens: Int = 8_000,
	val enablePlanMode: Boolean = false,
	val enableTracingLog: Boolean = true,
)
