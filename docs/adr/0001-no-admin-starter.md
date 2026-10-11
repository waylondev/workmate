# ADR-0001：不使用 agentscope-admin-spring-boot-starter

- **状态**：已接受
- **日期**：2026-10-11

## 背景

AgentScope 提供 `agentscope-admin-spring-boot-starter` 提供运维观测（actuator / 用量 / Swagger）。

## 决策

**不引入**该 starter，管理能力由本项目 `/api/*` 自建薄层提供。

## 理由

1. 它是 MVC（Servlet）栈，与本项目 Spring WebFlux 冲突。
2. 它只提供运维观测，不含业务 CRUD。
3. Maven 上无 WebFlux 变体。

## 后果

- `/actuator` 只暴露 Spring Boot 内置端点（health/info/metrics 等），**不存在** `agentscope-*` 端点。
- 管理能力（agent / 技能 / 定时任务）全部由 `org.waylon.workmate` 的 `/api/*` 提供。
