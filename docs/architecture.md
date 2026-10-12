# Workmate 架构

> 高层架构概览。功能级设计细节见 `design.md`（「为什么这么设计」），API 契约见 `api.md`，
> 技术决策（ADR）见 `adr/`。

## 分层

```
浏览器
 ├─ /agui/run/{agentId}   AG-UI over SSE  ─┐
 └─ /api/*                JSON REST       ─┤
                                          ▼
                        Spring WebFlux（薄层 org.waylon.workmate）
                        ├─ agent/  管理薄层（注册态切换）
                        ├─ skill/  管理薄层（列表 / 归档删除）
                        ├─ job/    管理薄层（cron 调度）
                        └─ web/    统一异常（RFC 7807）
                                          │
                        AgentScope 官方能力（端口，不重造）
                        ├─ AguiAgentRegistry      注册 / 注销
                        ├─ HarnessAgent           agent 实例（记忆/技能/权限引擎）
                        ├─ AgentSkillRepository   技能发现与删除
                        ├─ QuartzAgentScheduler   定时触发
                        └─ SessionTree / EVENT_LOG ⇒ 落盘 .agentscope/
```

## 核心原则

1. **对话即服务**：核心交付是 AG-UI SSE 流式对话；管理能力是围绕它的薄层。
2. **端口-适配器**：AgentScope 官方接口（`AgentSkillRepository` / `AgentScheduler` / `Model`）
   已是端口，本项目只写薄适配层，不重造。
3. **状态不引 DB**：会话内容 → SessionTree JSONL；业务元数据 → localStorage 或进程内状态。
4. **前后端唯一契约是 AG-UI**：两侧不共享业务代码，新增业务走 `/api/*`（Vite 代理）。

## 运行时环境

- 后端 8080（Spring Boot 4.1.1 / Kotlin 2.3.21 / JDK 25），前端 Vite 5173（`/agui` `/api` 代理到 8080）。
- 模型接入走 CPA（CLIProxyAPI）反代的 WorkBuddy 真实模型（`hy3`），配置见 `application.yaml`；详见 `design.md` 与 `README.md` 的环境说明。

## 领域模型

对话即服务的核心概念与载体（详见 `AGENTS.md` §六）：

| 概念 | 载体 | 归属 |
|---|---|---|
| Session | `threadId` 标识的对话隔离单元 | SessionTree JSONL |
| Message | 单条消息（user/assistant/tool） | 转录 JSONL（append-only） |
| Turn | 一轮「输入 → 响应」 | 由消息序列派生 |
| ToolCall | 一次工具调用（含 HITL 审批态） | AG-UI `TOOL_CALL_*` 事件 |
| AgentRuntime | agent 执行引擎 | HarnessAgent / 定时 ReActAgent |
| Policy | 权限 / 审批策略 | `PermissionMode` + 权限引擎 |
