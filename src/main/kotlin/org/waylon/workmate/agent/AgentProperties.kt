package org.waylon.workmate.agent

import org.springframework.boot.context.properties.ConfigurationProperties
import java.nio.file.Path

/**
 * 业务侧 harness agent 配置，对应 `workmate.agent.*`。
 */
@ConfigurationProperties("workmate.agent")
data class AgentProperties(
	val name: String,
	val sysPrompt: String,
	val workspace: Path,
)
