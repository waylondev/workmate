package org.waylon.workmate.agent

import io.agentscope.core.model.Model
import io.agentscope.spring.boot.agui.common.AguiAgentRegistryCustomizer
import io.agentscope.spring.boot.agui.common.AguiProperties
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

/**
 * Agent 装配。
 *
 * <p>[Model] 由官方 OpenAI starter 自动配置提供；`/agui/run/{agentId}` 路由与注册表由
 * agentscope-agui-spring-boot-starter 自动装配。本类只负责把配置中的 agent 交给官方注册表，
 * 因为 agent 由 [AgentCatalog] 持有而非 Spring bean（prototype 语义下官方不会自动纳管）。
 */
@Configuration(proxyBeanMethods = false)
class AgentConfiguration {

	@Bean
	fun agentCatalog(
		model: Model,
		properties: WorkmateProperties,
	) = AgentCatalog(model, properties)

	@Bean
	fun aguiAgentRegistrar(
		catalog: AgentCatalog,
		agui: AguiProperties,
	): AguiAgentRegistryCustomizer {
		// 默认 agent 是跨命名空间的字符串指针，写错只会静默 404，故在启动期断言
		require(catalog.agents.containsKey(agui.defaultAgentId)) {
			"agentscope.agui.default-agent-id='${agui.defaultAgentId}' 未在 workmate.agents 中定义，" +
				"已定义：${catalog.agents.keys}"
		}

		return AguiAgentRegistryCustomizer { registry ->
			catalog.agents.forEach { (id, agent) -> registry.register(id, agent) }
		}
	}
}
