package org.waylon.workmate.agent

import org.springframework.boot.context.properties.ConfigurationProperties

/** 顶层业务配置，对应 `workmate.*`。 */
@ConfigurationProperties("workmate")
data class WorkmateProperties(
	/** key 即 agent id，同时用于 AG-UI 路由（`/agui/run/{id}`）与 admin 管控面。未配置则启动失败。 */
	val agents: Map<String, AgentProperties>,
)
