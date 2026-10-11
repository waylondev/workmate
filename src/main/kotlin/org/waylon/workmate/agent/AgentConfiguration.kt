package org.waylon.workmate.agent

import io.agentscope.core.model.Model
import io.agentscope.core.permission.AdditionalWorkingDirectory
import io.agentscope.core.permission.PermissionContextState
import io.agentscope.harness.agent.HarnessAgent
import io.agentscope.spring.boot.agui.common.AguiAgentId
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

/**
 * HarnessAgent 装配。
 *
 * <p>[Model] 由官方 OpenAI starter 自动配置提供，AG-UI 注册表与 `/agui/run` 端点由
 * agentscope-agui-spring-boot-starter 自动装配；本类只声明 agent 本体与权限上下文。
 */
@Configuration(proxyBeanMethods = false)
class AgentConfiguration {

	@Bean
	@AguiAgentId(AGENT_ID)
	fun harnessAgent(model: Model, props: AgentProperties): HarnessAgent {
		val workspace = props.workspace.toAbsolutePath().normalize()

		// 必须是非 trivial 上下文才会启用权限引擎，否则非只读工具不会被拦截
		val permission = PermissionContextState.builder()
			.mode(props.permissionMode)
			.addWorkingDirectory(
				"workspace",
				AdditionalWorkingDirectory(workspace.toString(), "userSettings"),
			)
			.build()

		return HarnessAgent.builder()
			.name(props.name)
			.sysPrompt(props.sysPrompt)
			.model(model)
			.workspace(workspace)
			.maxIters(props.maxIters)
			.maxContextTokens(props.maxContextTokens)
			.enableAgentTracingLog(props.enableTracingLog)
			.permissionContext(permission)
			.apply { if (props.enablePlanMode) enablePlanMode() }
			.build()
	}

	companion object {
		/** 需与 `agentscope.agui.default-agent-id` 保持一致。 */
		const val AGENT_ID = "default"
	}
}
