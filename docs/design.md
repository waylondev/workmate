# Workmate 功能设计文档

> 状态：**已实现，且已在本机对真实模型完成端到端联调验证**。
> 逐项结果见 `docs/verification-report.md`。
>
> 与 `README.md` 的分工：README 讲「怎么跑」，本文讲「为什么这么设计、边界在哪」。
> 高层架构见 `architecture.md`，技术决策（ADR）见 `adr/`，API 契约见 `api.md`，
> 待做清单见 `roadmap.md`。
>
> 原则：**不引入数据库**，存储完全基于 AgentScope 官方能力，只在官方「积木」之上搭薄层。

## ★ 技术决策

每条都附当前实现中的落地实体，避免文档与代码分叉。

| # | 决策 | 理由 | 落地位置 |
|---|---|---|---|
| 1 | **不使用 `agentscope-admin-spring-boot-starter`** | 它是 MVC（Servlet）栈，与本项目 WebFlux 冲突；只提供运维观测（actuator / 用量 / Swagger），不含业务 CRUD；Maven 上无 WebFlux 变体 | 依赖已移除。实测 `/actuator` 只有 Spring Boot 内置端点，**不存在** `agentscope-*` |
| 2 | **直接复用官方 Bean，不造 Repository 抽象** | 官方能力已足够覆盖四种需求；再包一层「接口 + 文件实现」是多余抽象，会掩盖真实语义（例如技能删除究竟是归档还是硬删） | `agent/` `skill/` `job/` `web/` 四个薄层包 |
| 3 | **不启用 `agentscope.agui.server-side-memory`** | `HarnessAgent` 自带 EVENT_LOG + `SessionTree` 落盘，再维护一份内存会话池是冗余 | 用官方默认值 `false`；`ThreadSessionManager` 从不被填充 |
| 4 | **因此不暴露任何「会话池」接口** | 暴露一个架构上刻意不启用的组件，会让调用方以为「会话该从这里读」 | `/api/sessions` **已删除**（见 §3.1） |
| 5 | **定时任务用官方 `scheduler-quartz`，不用 Spring `TaskScheduler`** | 官方扩展零 Spring 依赖、栈无关；Quartz cron 表达式语义与前端输入一致；Spring `TaskScheduler` 需自行管理 `ScheduledFuture` 生命周期 | `QuartzAgentScheduler` + `JobSchedulerService` |
| 6 | **枚举 agent 用 `AgentCatalog`，注册状态用 `AguiAgentRegistry`** | 官方注册表**没有列出能力**，只有 `hasAgent` / `unregister`。把两个来源混用会让管理界面说谎 | `GET /api/agents` 同时返回定义与 `registered` |
| 7 | **注销设计为可逆** | 「注销」是不可逆操作时，误点一次就无法恢复 | `DELETE /api/agents/{id}` 与 `POST /api/agents/{id}/register` 成对 |

## ★ 已确证的官方 API

以下均在 jar 字节码级确认（`javap -p -c` 反编译 `~/.gradle/caches/.../io.agentscope/**`），不是 javadoc 推测。

| 能力 | 官方类 / 方法 | 本项目用法 |
|---|---|---|
| Agent 注册表 | `io.agentscope.core.agui.registry.AguiAgentRegistry`（`register` / `unregister` / `hasAgent`） | 运行时注销与恢复；**无列出能力** |
| 启动期注册钩子 | `io.agentscope.spring.boot.agui.common.AguiAgentRegistryCustomizer` | `AgentConfiguration` 把 catalog 全量注册 |
| AG-UI 配置 | `io.agentscope.spring.boot.agui.common.AguiProperties` | `default-agent-id` / `enable-reasoning` / `server-side-memory` |
| Agent 构建 | `io.agentscope.harness.agent.HarnessAgent.builder()` | 由 `AgentCatalog` 按配置构建 |
| 权限引擎 | `io.agentscope.core.permission.PermissionContextState` + `AdditionalWorkingDirectory` | 必须登记工作目录，否则权限引擎退回「仅工具自检」轻量路径 |
| 技能仓库 | `io.agentscope.core.skill.repository.AgentSkillRepository`（`allSkills` / `skillExists` / `delete` / `isWriteable` / `setWriteable` / `source` / `repositoryInfo`） | 技能列表与删除 |
| 工作区技能仓库 | `io.agentscope.harness.agent.skill.WorkspaceSkillRepository` | 归档语义删除（移到 `skills/.archive/`） |
| 调度器 | `io.agentscope.extensions.scheduler.quartz.QuartzAgentScheduler` + `AgentScheduler` / `BaseScheduleAgentTask` | 定时任务 |
| 调度配置 | `ScheduleConfig.builder().cron(...)`、`AgentConfig.builder().name/sysPrompt/modelConfig` | `JobSchedulerService` |
| 会话持久化 | `SessionTree` → `{threadId}/agents/{AgentName}/sessions/{threadId}.jsonl` + `.log.jsonl`，另有 `sessions.json` 索引 | 会话内容的**真相来源** |
| 事件持久化 | EVENT_LOG → `{threadId}/default/{AgentName}/{threadId}/events/*.jsonl` | 逐事件审计 |

**踩坑记录（都吃过一次）**

1. `agentscope-extensions-scheduler` 是**聚合 POM，无 jar**，实现代码在 `agentscope-extensions-scheduler-quartz`。
2. 官方 scheduler 只自带 `DashScopeModelConfig`，OpenAI 兼容端点必须自适配（本项目 `SharedModelConfig`）。
3. `AgentScheduler.schedule(...)` 的**泛型被擦除**，Kotlin 侧只能看到 `ScheduleAgentTask<*>`，收窄需 `@Suppress("UNCHECKED_CAST")`。
4. `BaseScheduleAgentTask.createAgent()` 每次触发**新建 `ReActAgent`**，不接受外部 agent 实例 → 定时任务无法复用 `HarnessAgent`（见 §3.4 边界）。
5. `HarnessAgent` 不暴露 `sysPrompt` getter；人设只能从 `workmate.agents.<id>` 配置取。
6. `HarnessAgent` 缺省 description 会生成 `Agent(<uuid>) Name` 这类无意义字符串，必须显式给。
7. 官方 `isTrivial()`：`permission-mode=default` 且**无工作目录、无规则**时，权限引擎退回轻量路径，配置的 `permission-mode` 不参与判定。

## 0. 已实现范围

| 目标功能 | 实现 |
|---|---|
| **会话** | 前端本地会话目录（localStorage）+ 后端 `SessionTree` 转录落盘；支持多轮上下文复用 |
| **Agent 专家管理** | `GET /api/agents` 列表（定义 + 注册态）/ `DELETE` 注销 / `POST /register` 恢复 |
| **技能管理** | `GET /api/agents/{id}/skills` 列出（含来源仓库与可写性）/ `DELETE` 归档删除 |
| **定时任务** | `POST /api/jobs` 创建 cron / `GET` 列表（含已触发次数）/ `DELETE` 取消 |
| **前端** | 三栏外壳（左栏导航 + 中栏对话 + 右栏「对话摘要」实时工作进度） |

**不做**：数据库、多租户、用户体系、会话池诊断接口。

## 1. 存储决策

**不引入数据库。** 理由逐条：

1. **最重的「会话状态 / 记忆 / 上下文」** —— AgentScope 官方 `SessionTree` + EVENT_LOG 已用 JSONL 文件搞定。
2. **技能天然是文件** —— `SKILL.md` 目录即技能本体，文件系统是唯一合理存储。
3. **agent 定义是低频小体量配置** —— `application.yaml` 足够。
4. **单机内部工具** —— 无高并发 / 多实例共享需求，DB 无收益。

实际落点：

| 数据 | 存储 | 生命周期 |
|---|---|---|
| 会话内容（消息、记忆、上下文） | `.agentscope/workspace/{agentId}/{threadId}/` 下的 JSONL | 与磁盘同寿 |
| 会话目录（标题、所属 agent、更新时间） | 浏览器 localStorage | 与浏览器同寿 |
| 技能 | `.agentscope/workspace/{agentId}/skills/<name>/SKILL.md` | 与磁盘同寿（删除 = 归档） |
| agent 定义 | `application.yaml` 的 `workmate.agents` | 随进程 |
| 定时任务定义 | `.agentscope/jobs.json`（`JobDefinitionStore` 落盘） | 与磁盘同寿（重启恢复） |

## 2. 总体架构

```
浏览器
 ├─ /agui/run/{agentId}   AG-UI over SSE  ─┐
 └─ /api/*                JSON REST       ─┤
                                          ▼
                        Spring WebFlux（薄层，org.waylon.workmate）
                        ├─ agent/  AgentAdminController  → AgentCatalog + AguiAgentRegistry
                        ├─ skill/  SkillController       → SkillAdminService
                        ├─ job/    JobController         → JobSchedulerService
                        └─ web/    ApiExceptionHandler   → RFC 7807 ProblemDetail
                                          │
                        AgentScope 官方能力（不重造）
                        ├─ AguiAgentRegistry      注册 / 注销 / hasAgent
                        ├─ HarnessAgent           agent 实例（含记忆 / 技能 / 权限引擎）
                        ├─ AgentSkillRepository   技能发现与删除
                        ├─ QuartzAgentScheduler   定时触发
                        └─ SessionTree / EVENT_LOG  ⇒ 落盘在 .agentscope/
```

**核心原则**

- 会话**内容** → 交给 AgentScope 官方，不自己存。
- **业务元数据**（会话目录、注册态）→ 前端 localStorage 或进程内状态，不引 DB。
- `/agui`（聊天）与 `/api/*`（管理）两条路径分离，互不依赖。
- 官方 AG-UI 端点的错误语义是 SSE `RUN_ERROR` **事件**，因此 `ApiExceptionHandler` 用 `basePackages = ["org.waylon.workmate"]` 限定范围，不去改写官方端点的行为。

## 3. 功能设计

### 3.1 会话

**两个层次必须分清**，否则接口会误导调用方：

| 层次 | 载体 | 说明 |
|---|---|---|
| **会话内容**（消息 / 记忆 / 上下文） | `SessionTree` 落盘 JSONL | append-only；进程重启后仍在。**这是会话的真相来源** |
| **会话目录**（标题 / agent / 时间） | 前端 localStorage | 纯展示用；丢失只影响侧栏 |

**为什么不提供 `/api/sessions`**

本项目用官方默认 `server-side-memory=false`（§技术决策 3），官方 `ThreadSessionManager` 的内存会话池**从不被填充**。历史实现提供的 `GET /api/sessions` 因此恒返回 `{"activeSessions":0,"sessions":[]}`，`DELETE` 恒 `removed:false` —— 这是个结构性死胡同：实现本身没错，错在**暴露了一个刻意不启用的组件**。

> 反证：另起一个实例加 `--agentscope.agui.server-side-memory=true`，同一次调用后池立即填充为 `activeSessions:1` 且字段齐全。所以空池由配置决定，不是 bug。

**决策**：删除 `SessionController`，前端同步移除那座 fire-and-forget 的 `DELETE` 调用。侧栏动作语义改为「从最近列表移除（服务端转录保留）」，文案如实描述行为。

> 若未来确实需要服务端会话列表 / 删除，正确做法是**读 `SessionTree` 的转录与 `sessions.json` 索引**（那才是真相），而不是打开 `server-side-memory` 再读内存池。属新增功能，需单独定夺。

**多轮上下文复用**：前端 `AgUiRuntimeProvider` 的 `threadId` 由外部传入（不再是 `crypto.randomUUID()`），切换会话即切换 `threadId`，后端按 `(userId, sessionId)` 隔离状态并追加转录。

### 3.2 Agent 专家管理

**薄层职责**：只切换「是否注册到 AG-UI 路由」这一运行时状态，**不新增 / 修改 agent 定义**（定义来自 `workmate.agents`，启动期由 `AgentCatalog` 构建）。

| 端点 | 行为 |
|---|---|
| `GET /api/agents` | 以 `AgentCatalog` 枚举（注册表没有列出能力），每项附加 `registry.hasAgent(id)` 作为 `registered` |
| `DELETE /api/agents/{id}` | `registry.unregister(id)`；未知 id → 404 |
| `POST /api/agents/{id}/register` | `catalog.register(registry, id)` 恢复路由；未知 id → 404 |

**注销是可逆的**（§技术决策 7）。这是历史缺陷的直接修复：原实现只动注册表而列表读 catalog，导致 UI 上「注销」既看不出效果、也不可恢复。

`AgentCatalog` 是 `DisposableBean`，容器关闭时统一 `close()` 全部 `HarnessAgent`，避免 Toolkit / WorkspaceManager / state store 泄漏。

### 3.3 技能管理

**目录约定**：`<agent workspace>/skills/<name>/SKILL.md`，由官方仓库扫描发现，运行期新建目录**即时可见**（无需重启）。

`SkillAdminService` 的两个非显然设计：

**① 删除需要临时打开写开关。**
官方 `HarnessAgentBuilderSupport.composeSkillRepositories` 装配仓库的顺序是：

1. `projectGlobalSkillsDir` 的 `FileSystemSkillRepository`（若配置）
2. builder 显式传入的仓库
3. `<workspace>/skills` 的 `FileSystemSkillRepository`（**仅当构建期该目录已存在**）
4. `WorkspaceSkillRepository(filesystem, "skills", "workspace-namespaced", writable = false)` —— **恒只读**

因此运行期新建的技能目录只有第 4 个仓库看得见，它 `writable=false`，`delete()` 会记一条 `is currently read-only; delete() ignored` 并返回 `false`。这正是历史上 `DELETE` 返回 `deleted:false` 且文件不动的根因。

**修复方式**：删除时在调用期间 `setWriteable(true)`，`finally` 还原。官方把 `setWriteable` 暴露在接口上，就是为这种「外部管理面」预留；还原是为了不改动 agent 运行时的默认保护姿态。

**② 删除语义是归档，不是硬删。**
仓库选择优先级：`WorkspaceSkillRepository`（归档到 `skills/.archive/<name>-<ts>`，可恢复）> 任意可写仓库（硬删）> 无（409）。响应如实回传 `archived`，避免接口文档与真实行为不一致。

| 端点 | 行为 |
|---|---|
| `GET /api/agents/{id}/skills` | 按技能名去重聚合全部来源仓库，每项带 `repositories[]`（`source` / `type` / `location` / `writable` / `archivedOnDelete`）与 `deletable` |
| `DELETE /api/agents/{id}/skills/{name}` | 技能不存在 → 404；仓库全只读 → 409 |

### 3.4 定时任务

**为什么是 Quartz**（§技术决策 5）：官方扩展栈无关且 cron 语义与前端输入一致。

`JobSchedulerService` 在官方 `AgentScheduler` 之上补两件事：

1. **cron 前置校验**：`CronExpression.isValidExpression(cron)` 不过即 400。历史实现把非法表达式直接带进 Quartz，以未处理异常变成 500。
2. **任务定义投影**：官方 `ScheduleAgentTask` 只保留任务名与调度配置，**不记录目标 agentId**，因此额外维护 `name → {agentId, cron}` 作为「任务列表」的真实来源；`list()` 同时纳入「调度器里有、定义里没有」的任务，不隐藏异常状态。

**边界（必须知道）**：官方 `BaseScheduleAgentTask` 在**每次触发时新建 `ReActAgent`**（`name` + `sysPrompt` + `model` + 可选 `toolkit/hooks`），**不接受外部 agent 实例**。所以定时任务复用的是「agent 的声明」（`workmate.agents.<id>` 的 `sysPrompt`）与应用级 `Model`，**而不是 `AgentCatalog` 里的 `HarnessAgent`** ——

> **定时任务不享有 workspace / 记忆 / 技能 / 权限引擎。**

| 端点 | 行为 |
|---|---|
| `POST /api/jobs` | 成功 201；参数不合法 → 400；agent 不存在 → 404；任务名重复 → 409 |
| `GET /api/jobs` | 含 `id`（官方任务对象 id）/ `agentId` / `cron` / `executions`（已触发次数） |
| `DELETE /api/jobs/{name}` | 幂等，`cancelled=false` 表示本就不存在 |

任务定义**已持久化**：`JobDefinitionStore` 把 `name → {agentId, cron}` 落盘到 `.agentscope/jobs.json`
（运行态数据，随 `.agentscope/` 被 `.gitignore` 忽略），`JobSchedulerService` 启动时加载并重新注册回
Quartz，创建/取消时同步写回。落盘失败只记日志、不阻断已注册的任务；文件损坏时视为空启动。

### 3.5 错误契约

业务 REST 统一返回 RFC 7807 `application/problem+json`：

```json
{ "type": "about:blank", "title": "Not Found", "status": 404,
  "detail": "agent not found: nope", "instance": "/api/jobs" }
```

| 场景 | 状态码 |
|---|---|
| 参数不合法（cron 非法、name 为空） | 400 |
| 资源不存在（未知 agent / 技能 / 任务） | 404 |
| 状态冲突（任务名重复、仓库只读） | 409 |
| 控制器内未预期异常 | 500（细节只留服务端日志，对外给通用信息） |

前端 `api.ts` 的 `ApiError` 取出 `detail` 直接展示，UI 不再出现无信息量的 "400 Bad Request"。

> 历史缺陷：`POST /api/jobs` 参数错误曾返回 HTTP 200 + `{"error": ...}`，前端会把失败当成功（表单被清空且无任何提示）。已修复。

### 3.6 前端三栏外壳

```
┌───────────────┬─────────────────────────────┬──────────────────────┐
│ AppSidebar    │ ChatHeader + Thread          │ ConversationSummary  │
│ 品牌 / 功能导航 │ 折叠侧栏 · 右栏开关 · 新建会话 │ 工作进度（实时派生）   │
│ 工作区（agent） │ Composer（含 ComposerChips） │ 对话产物 / 后台任务    │
│ 最近会话       │                              │ 技能 / 最近文件        │
│ 用户区 / 主题   │                              │                      │
└───────────────┴─────────────────────────────┴──────────────────────┘
```

**关键约束：右栏不维护独立状态。**
`src/work-progress.ts` 是纯函数，从 assistant-ui 的 `AssistantState["thread"]["messages"]` 派生：

| 派生 | 数据源 | 规则 |
|---|---|---|
| 工作进度 | `TOOL_CALL_*` 事件 | 每次工具调用 → 一个步骤；按「有无结果 / 是否失败」判 `running` / `done` / `failed`，并带本地化标签与参数摘要 |
| 对话产物 | 消息中的产物工具调用 | 列出本次会话生成的文件 |
| 最近文件 | 会话消息 | 近期触碰的文件 |
| 后台任务 / 技能 | `/api/jobs`、`/api/agents/{id}/skills` | 直接拉后端，非派生 |

因此右栏**必须渲染在 `AgUiRuntimeProvider` 之内**（依赖 `useAuiState`），且天然不会与中栏状态不同步。

**锚点联动**：输入区的 `ComposerChips`（agent / 权限 / 技能 / 工作进度 chip）经 `ChatChrome.revealPanel(section)` 展开右栏并 `scrollIntoView` 到 `#summary-{section}`。

**切换 agent 用 `key` 重挂载运行时**，每个 agent 是一段独立会话，避免跨 agent 串上下文。

**会话目录在前端**（§3.1）：`sessions.ts` 用 localStorage 维护 `threadId → { agentId, title, updatedAt }`，首条用户消息自动生成标题。

## 4. 实施状态

| 阶段 | 内容 | 状态 |
|---|---|---|
| P0 | 模型接入（OpenAI 兼容端点 / 本地 mock / CPA 反代真实模型） | ✅ 已实测 |
| P1 | 会话（本地目录 + SessionTree 转录 + 多轮复用） | ✅ 已实测 |
| P2 | Agent 管理（列表 + 可逆注销 + 管理页） | ✅ 已实测 |
| P3 | 技能管理（来源仓库 + 归档删除 + 管理页） | ✅ 已实测 |
| P4 | 定时任务（cron 创建 / 列表 / 取消，真实触发已验证） | ✅ 已实测 |
| P4.1 | 定时任务定义持久化（落盘 + 重启恢复） | ✅ 已实测 |
| P5 | 三栏前端外壳（左栏 / 中栏 / 右栏工作进度） | ✅ 已构建 + SSR 校验 |
| — | 服务端会话列表与删除 | ⬜ 未做（见 §3.1） |

## 5. 官方 API 核销

§「已确证的官方 API」中的条目**全部经字节码级确认**，早期版本本节列出的「未确证点」（`ThreadSessionManager` 包名、`AguiAgentRegistry` 包名、`ScheduleConfig.Builder` 方法名、`HarnessAgent.description` 可空性）**已全部核销**：项目当前编译通过且功能实测正常，即为终局证据。

## 6. 已知限制

| # | 限制 | 影响 | 说明 |
|---|---|---|---|
| 1 | **定时任务无 workspace / 记忆 / 技能 / 权限引擎** | 定时跑的 agent 是轻量 `ReActAgent`，不是完整的 `HarnessAgent` | 官方 `createAgent()` 语义决定，非本项目可绕 |
| 2 | **复用带未决审批的 threadId 需先 resume** | 裸客户端未 resume 就复用会收到 `RUN_ERROR: Thread has unresolved interrupts` | 这是 AG-UI 的 interrupt 契约，不是缺陷；前端 `tool-fallback.aui.tsx` 用 `respondToApproval` / `addResult` 解决 |
| 3 | **技能删除依赖 `setWriteable` 临时开闸** | 并发删除同一技能存在竞态窗口 | 单机管理面可接受；若要严格化需仓库层支持原子归档 |
| 4 | **agent 定义不可运行时增删改** | 只支持注册态切换 | 定义来自 yaml，属未做项 |
