# Workmate 需求

> 目标与范围的定义。已实现项与路线图见 `roadmap.md`，功能设计见 `design.md`。

## 目标

- **理念：对话即服务。** 提供一个「开箱即用、可扩展」的企业级 Agent 底座。
- 完整可用：流式对话、工具调用与 HITL 授权、agent / 技能 / 定时任务管理。
- 可扩展：通过 AgentScope 官方端口（技能 / 工具 / 调度 / 存储）扩展，不重造轮子。

## 非目标（明确不做）

- 数据库、多租户、用户体系 / 鉴权（单机内部工具，见 `roadmap.md` N-1/N-2）。
- 会话池诊断接口（刻意不启用 server-side-memory，见 `adr/0003`）。
- MVC 栈的 admin-starter（与 WebFlux 冲突，见 `adr/0001`）。

## 功能需求（按域）

### 对话
- AG-UI over SSE 流式对话，输出思考过程（REASONING_*）与 token 用量事件。
- 多轮上下文复用（threadId 隔离）。
- 工具调用可视化 + Human-in-the-loop 授权（允许 / 全部允许 / 拒绝 / 本会话自动批准）。

### Agent 管理
- 列出全部 agent（定义 + 注册态）。
- 可逆注销 / 恢复（注销不删除定义）。

### 技能管理
- 列出某 agent 技能及来源仓库、可写性、删除语义。
- 删除 = 归档（可恢复）。

### 定时任务
- cron 创建 / 列表（含触发次数）/ 取消（幂等）。
- 参数不合法 400、agent 不存在 404、任务名重复 409。

### 非功能
- 统一 RFC 7807 错误契约。
- 最小依赖，复用官方能力，不引数据库。

## 验收标准

- 后端 `./gradlew test` 通过；前端 `pnpm check:ui` / `check:agui` / `lint` / `build` 全绿。
- 关键路径（对话 / HITL / 管理 CRUD）有真实端到端验证记录（见 `verification-report.md`）。
