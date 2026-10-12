# Workmate 路线图

> 单一真相来源：项目「已实现 / 待做 / 不做」的完整清单。实施时按优先级从上往下取。
> 状态标记：✅ 已实现并验证 · ⬜ 未做 · 🚧 进行中

## 已实现（基础能力）

| # | 能力 | 状态 | 说明 |
|---|---|---|---|
| R1 | 模型接入（OpenAI 兼容 / CPA 反代） | ✅ | `agentscope-openai` starter |
| R2 | AG-UI over SSE 流式对话 | ✅ | 思考 + 工具调用 + token 用量事件 |
| R3 | 会话（本地目录 + SessionTree 转录 + 多轮复用） | ✅ | 见 `design.md` §3.1 |
| R4 | Agent 管理（列表 + 可逆注销） | ✅ | `/api/agents` |
| R5 | 技能管理（来源仓库 + 归档删除） | ✅ | `/api/agents/{id}/skills` |
| R6 | 定时任务（cron 创建 / 列表 / 取消） | ✅ | `/api/jobs`，Quartz |
| R7 | 三栏前端 + 科技感视觉 | ✅ | 授权横幅 / 全部允许 / 工作进度 |
| R8 | HITL 工具授权闭环 | ✅ | `permission_confirm` → 横幅 → 放行 |
| R9 | 统一 RFC 7807 错误契约 | ✅ | `ApiExceptionHandler` |

## 待做（按优先级）

### P0 — 信任与正确性

| # | 优化点 | 影响 | 前置 |
|---|---|---|---|
| P0-1 | ~~定时任务定义持久化~~ | ✅ 已实现（`JobDefinitionStore` 落盘 `.agentscope/jobs.json`，重启恢复） | 已完成 |
| P0-2 | ~~移除 `application.yaml` 硬编码密钥~~ | ✅ 已修复（`api-key` 改为 `${OPENAI_API_KEY:}` 空默认值） | 已完成 |

### P1 — 功能完整性

| # | 优化点 | 影响 |
|---|---|---|
| P1-1 | ~~服务端会话列表 / 删除~~ | ✅ 已实现（`SessionAdminService` 直删 `workspace/{threadId}/` 目录） |
| P1-2 | ~~Agent 定义热加载~~ | ✅ 已撤销，移入 N-7（官方无 reload API，且已被 subagent 机制替代） |

### P2 — 锦上添花

| # | 优化点 | 说明 |
|---|---|---|
| P2-1 | token 用量可视化 | 已 emit `token_usage` 事件，前端已展示 |
| P2-2 | 定时任务执行历史 / 日志 | 已实现：`GET /api/jobs/{name}/executions`，官方 Hook 捕获输出/token |
| P2-3 | 移动端响应式 | 三栏在窄屏体验差 |

## 明确不做（架构决策）

| # | 项 | 理由 |
|---|---|---|
| N-1 | 数据库 | AgentScope 文件型能力已足够（`design.md` §1） |
| N-2 | 多租户 / 用户体系 / 鉴权 | 单机内部工具，无需求 |
| N-3 | 会话池诊断接口（server-side-memory） | 刻意不启用的组件，暴露会误导 |
| N-4 | `agentscope-admin-spring-boot-starter` | MVC 栈与 WebFlux 冲突 |
| N-5 | 技能恢复（unarchive）/ 启停开关 | 官方 `AgentSkillRepository` 只有 `save`/`delete`，无恢复也无启停状态；`delete()` 内部 move 到 `.archive/` 只是避免直接删除的兜底，**非承诺可逆**。不做超出官方能力的自建语义 |
| N-6 | 会话续聊（resume）显式入口 | 官方 resume（`AguiResume` / `AguiResumeCoordinator`）是**内存态、单次运行内**的：`interruptId` 只存在于当次 SSE 流与后端内存，不落盘、后端重启即丢。正常工具审批闭环前端已通（`respondToToolApproval`），跨刷新/跨重启场景无 id 可 resume。前端补「显式 resume 入口」是在依赖官方未承诺的生命周期，不做 |
| N-7 | Agent 定义热加载 | 官方 `AguiAgentRegistry` 只支持运行时 `register`/`unregister`（切换注册态，项目已用），**没有**「从配置重新加载 agent 定义」的 API——`HarnessAgent` 是启动期 `build()` 一次性构建，无 reload 机制。且此需求已被**子智能体声明机制**替代：需要动态扩展的领域能力走 `workspace/subagents/*.md`（官方自动装配），顶层 agent（AG-UI 路由入口）本就该少数且稳定、改定义就该重启。不做 |

## 变更记录

- 2026-10-12：建立本路线图；P0-2（硬编码密钥）已确认并修复。
- 2026-10-12：P0-1（定时任务持久化）已实现——`JobDefinitionStore` 落盘 `.agentscope/jobs.json`，重启恢复，端到端验证通过。
- 2026-10-12：撤销原 P1-1「技能恢复接口」——经反编译核验，官方 `AgentSkillRepository` 无 unarchive/启停能力，`delete()` 归档仅为兜底非承诺可逆；不做超出官方能力的自建语义，移入「明确不做」N-5。
- 2026-10-12：P1-1（服务端会话列表/删除）已实现——`SessionAdminService` 直接操作 `workspace/{threadId}/` 目录，官方无会话管理 API（`listSessionLogFiles` 命名空间相关），端到端验证通过。
- 2026-10-12：撤销 P1-3「会话续聊 resume 入口」——经反编译核验，官方 `AguiResume`/`AguiResumeCoordinator` 的 `interruptId` 只在单次运行内存态，不落盘、后端重启即丢，跨刷新/重启无 id 可 resume；正常审批闭环前端已通。移入「明确不做」N-6。
- 2026-10-12：撤销 P1-2「Agent 定义热加载」——官方 `AguiAgentRegistry` 无 reload 定义 API（只有 register/unregister），且此需求已被子智能体声明机制（`workspace/subagents/*.md` 官方自动装配）替代。移入「明确不做」N-7；同步新增 `subagents/` 的 `.gitignore` 豁免与 `design.md` §3.2.1 说明。
- 2026-10-12：P2-2（定时任务执行历史）已实现——经反编译确证官方 `AgentScheduler` 的 hooks 通道（需直接传 `RuntimeAgentConfig` 而非基类 `AgentConfig`，且 `Hook` 列表跨触发共享须无状态），用 `ExecutionRecordingHook` + `JobExecutionStore` 捕获每次触发的输出/token/状态，新增 `GET /api/jobs/{name}/executions`，端到端验证计数与明细对齐。
