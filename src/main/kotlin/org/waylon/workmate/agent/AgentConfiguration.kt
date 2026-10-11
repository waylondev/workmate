package org.waylon.workmate.agent

import io.agentscope.core.model.Model
import io.agentscope.harness.agent.HarnessAgent
import io.agentscope.spring.boot.agui.common.AguiAgentId
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

/**
 * HarnessAgent 装配。
 *
 * <p>[Model] 由官方 OpenAI starter 自动配置提供；AG-UI 注册表与 `/agui/run` 端点由
 * agentscope-agui-spring-boot-starter 自动装配，本类只声明 agent 本体。
 */
@Configuration(proxyBeanMethods = false)
class AgentConfiguration {

	@Bean
	@AguiAgentId(AGENT_ID)
	fun harnessAgent(model: Model, props: AgentProperties): HarnessAgent =
		HarnessAgent.builder()
			.name(props.name)
			.sysPrompt(props.sysPrompt)
			.model(model)
			.workspace(props.workspace)
			.build()

	companion object {
		/** 需与 `agentscope.agui.default-agent-id` 保持一致。 */
		const val AGENT_ID = "default"
	}
}
