# Workmate

企业级 Agent 底座。后端以 Spring WebFlux 承载 AgentScope 智能体并暴露 AG-UI 协议端点，前端用 React + assistant-ui 消费 SSE 事件流，实现流式对话、思考过程与工具调用可视化。

## 架构

```
浏览器
  └─ React / assistant-ui（前端，frontend/）
       └─ @assistant-ui/react-ag-ui  ← 解析 AG-UI 事件
            └─ POST /agui/run/{agentId}   (AG-UI over SSE)
                 └─ Spring WebFlux（后端，本项目根目录）
                      └─ AgentScope HarnessAgent
                           └─ Model（OpenAI 兼容）
```

AG-UI 协议是前后端的唯一契约：后端只负责注册 Agent 并输出事件流，前端只负责渲染事件，两侧不共享任何业务代码。

## 后端技术栈

| 分类 | 选型 | 版本 |
| --- | --- | --- |
| 语言 | Kotlin | 2.3.21 |
| 运行时 | JDK（Gradle toolchain） | 25 |
| 框架 | Spring Boot / Spring Framework | 4.1.1 / 7 |
| Web | Spring WebFlux（响应式，SSE） | — |
| 智能体框架 | AgentScope Java | 2.0.4 |
| 构建 | Gradle（Kotlin DSL） | 9.7.1 |

AgentScope 相关依赖（`io.agentscope:2.0.4`）：

| 制品 | 作用 |
| --- | --- |
| `agentscope-harness` | `HarnessAgent` 核心，内置记忆、上下文压缩、transcript、技能、子智能体、内置工具 |
| `agentscope-agui-spring-boot-starter` | AG-UI 端点与 Agent 注册表自动配置（WebFlux / MVC 双栈，本项目走 WebFlux） |
| `agentscope-openai-spring-boot-starter` | OpenAI 兼容模型接入，自动配置 `Model` |
| `agentscope-extensions-scheduler-common` | 定时任务公共 API（`AgentScheduler` / `BaseScheduleAgentTask` / `AgentConfig`） |
| `agentscope-extensions-scheduler-quartz` | 定时任务（官方 Quartz 扩展，本项目 `job/` 薄层建在它上面） |

> **不使用 `agentscope-admin-spring-boot-starter`**：它是 MVC（Servlet）栈，与本项目 WebFlux 冲突，且只提供运维观测而非业务 CRUD。因此 `/actuator` 下**不存在** `agentscope-*` 端点，管理能力由本项目 `/api/*` 提供。

**状态存储**：使用 AgentScope 内置的文件型会话状态（默认实现，落盘在 `.agentscope/`），无需外部数据库。`HarnessAgent` 自带 EVENT_LOG 持久化，因此**不启用** AG-UI 的 `server-side-memory`：该开关为 `false` 时官方 `ThreadSessionManager` 内存会话池从不被填充，所以本项目不暴露任何"会话池"接口 —— 会话内容的真相来源是磁盘上的转录 JSONL。

**权限模型**：按 Agent 配置官方 `PermissionMode`（`default` / `accept-edits` / `explore` / `bypass` / `dont-ask`），并通过 `PermissionContextState` 登记工作目录启用完整权限引擎，非只读操作会以 `permission_confirm` 事件回到前端做 Human-in-the-loop 审批。

## 前端技术栈

| 分类 | 选型 | 版本 |
| --- | --- | --- |
| 框架 | React + TypeScript | 19 / 6.0 |
| 构建 | Vite | 8.3 |
| React 插件 | `@vitejs/plugin-react` | 6.1 |
| 样式 | Tailwind CSS（`@tailwindcss/vite`） | 4.3 |
| 聊天运行时 | `@assistant-ui/react` | 0.15.27 |
| AG-UI 适配器 | `@assistant-ui/react-ag-ui` | 0.0.67 |
| AG-UI 客户端 | `@ag-ui/client` | **0.0.59（锁定）** |
| Markdown | `@assistant-ui/react-markdown` + `remark-gfm` | — |
| UI 基础 | `@base-ui/react` + shadcn 风格组件 | — |
| 图标 / 样式工具 | `lucide-react`、`class-variance-authority`、`tailwind-merge`、`clsx` | — |
| 包管理 | pnpm | 10.26 |

`@ag-ui/client` 必须锁 `0.0.59`：`react-ag-ui@0.0.67` 的 peer 范围是 `^0.0.59`，装 1.x 会导致 `AbstractAgent` 出现两份实例、类型与运行时都不一致。

`src/components/` 下由 assistant-ui 官方 CLI 生成的基础 UI 组件（thread / reasoning / tool-fallback / tool-group / markdown-text / attachment 等）属仓库自有源码，可直接改样式。

### 三栏外壳

```
┌───────────────┬─────────────────────────────┬──────────────────────┐
│ AppSidebar    │ ChatHeader + Thread          │ ConversationSummary  │
│ 品牌 / 功能导航 │ 折叠侧栏 · 右栏开关 · 新建会话 │ 工作进度（实时派生）   │
│ 工作区（agent） │ Composer（含 ComposerChips） │ 对话产物 / 后台任务    │
│ 最近会话       │                              │ 技能 / 最近文件        │
│ 用户区 / 主题   │                              │                      │
└───────────────┴─────────────────────────────┴──────────────────────┘
```

- **右栏「对话摘要」不维护独立状态**：`src/work-progress.ts` 是从 assistant-ui 的 `AssistantState["thread"]["messages"]` 派生数据的纯函数（工具调用 → 工作步骤，含进行中 / 完成 / 失败三态，以及对话产物、最近文件）。因此右栏必须渲染在 `AgUiRuntimeProvider` 之内。
- **锚点联动**：输入区的 `ComposerChips`（agent / 权限 / 技能 / 工作进度 chip）经 `ChatChrome.revealPanel(section)` 展开右栏并滚动到 `#summary-{section}`。
- **工具授权**：工具需授权时，中栏顶部弹出 `ApprovalBanner`（醒目横幅，列出待确认工具），可直接「允许 / 全部允许 / 拒绝」，并可勾选「本会话内自动批准」。待授权项由 `src/approvals.ts` 的纯函数从消息树派生，批准经 `ag-ui-runtime-provider.tsx` 暴露的 `respondToToolApproval` 回传后端。工具卡在 `requires-action` 态收起时即高亮（琥珀色边框 + 「待授权」徽章）。
- **会话目录在前端**：`src/sessions.ts` 用 localStorage 维护 `threadId → { agentId, title, updatedAt }`，首条用户消息自动生成标题。真正的对话转录由后端 SessionTree 落盘，侧栏「移除」会调用 `DELETE /api/agents/{id}/sessions/{threadId}` **真删**服务端转录目录（不可逆）。
- `src/agents.ts` 是前端的 agent **类型与展示映射**：agent 目录不再硬编码，由 `GET /api/agents` 动态拉取（权威来源是后端 `workmate.agents`）。左栏「工作区」段与输入区 chip 都从这份动态列表渲染，切换时以 `key` 重挂载运行时，每个 agent 是一段独立会话；权限模式的中文标签（需审批/自动放行/只读）由 `permissionLabel()` 做纯展示映射。

## 目录结构

```
workmate/
├── src/main/kotlin/org/waylon/workmate/
│   ├── WorkmateApplication.kt          # 启动类
│   ├── agent/
│   │   ├── WorkmateProperties.kt       # workmate.* 顶层配置
│   │   ├── AgentProperties.kt          # 单个 agent 的配置项
│   │   ├── AgentCatalog.kt             # 按配置构造并持有全部 HarnessAgent
│   │   ├── AgentConfiguration.kt       # 把 agent 注册到 AG-UI 官方注册表
│   │   └── AgentAdminController.kt     # /api/agents：枚举 + 注销 + 重新注册
│   ├── skill/
│   │   ├── SkillAdminService.kt        # 技能枚举 / 删除（复用官方 AgentSkillRepository）
│   │   └── SkillController.kt          # /api/agents/{id}/skills
│   ├── session/
│   │   ├── SessionAdminService.kt      # 会话列表 / 删除（直删 workspace/{threadId}/ 目录）
│   │   └── SessionController.kt        # /api/agents/{id}/sessions
│   ├── job/
│   │   ├── JobSchedulerConfiguration.kt # Quartz 调度 Bean（官方扩展）+ JobSchedulerService
│   │   ├── JobDefinitionStore.kt        # 任务定义落盘（.agentscope/jobs.json，重启恢复）
│   │   ├── ExecutionRecordingHook.kt    # 官方 Hook：捕获每次触发的输出/token/状态
│   │   ├── JobExecution.kt              # 执行记录 data class
│   │   ├── JobExecutionStore.kt         # 执行历史落盘（.agentscope/job-executions.json，每任务 50 条）
│   │   └── JobController.kt            # /api/jobs：创建 / 列表 / 取消 / 执行历史
│   └── web/
│       ├── ApiException.kt             # 业务异常 → HTTP 状态码
│       └── ApiExceptionHandler.kt      # 统一 RFC 7807 ProblemDetail 错误体
├── src/main/resources/application.yaml # 全部运行时配置
├── frontend/                           # 前端工程（独立根目录）
│   ├── src/App.tsx                     # 三栏外壳（侧栏 / 中栏 / 右栏对话摘要）
│   ├── src/ag-ui-runtime-provider.tsx  # AG-UI 运行时接入 + 审批能力上下文
│   ├── src/agui-sse.ts                 # SSE 包装：剔除 expiresAt:null 再交运行时解析
│   ├── src/agui-errors.ts              # 运行失败归类（会话卡在待授权 → 出路）
│   ├── src/agents.ts                   # agent 类型 + 权限中文标签映射（目录由 /api/agents 动态拉取）
│   ├── src/approvals.ts                # 待授权项派生（纯函数，横幅数据源）
│   ├── src/thread-types.ts             # 线程消息共享类型（work-progress / approvals 共用）
│   ├── src/api.ts                      # /api/* 封装（RFC 7807 → ApiError）
│   ├── src/sessions.ts                 # 本地会话目录（localStorage）
│   ├── src/work-progress.ts            # 右栏派生逻辑（纯函数，无独立状态）
│   ├── src/chat-chrome.tsx             # 中栏 ↔ 右栏联动上下文
│   ├── src/nav.ts                      # 导航键定义
│   ├── src/AdminPanel.tsx              # Agent / 技能 / 定时任务管理页
│   ├── src/components/                 # assistant-ui CLI 生成组件 + 外壳组件
│   │   ├── app-sidebar.tsx             # 左栏
│   │   ├── conversation-summary-panel.tsx # 右栏
│   │   ├── approval-banner.tsx         # 工具授权横幅（允许 / 全部允许 / 拒绝）
│   │   └── composer-chips.tsx          # 输入区工具条（锚点联动）
│   ├── scripts/ui-check.tsx            # SSR 三栏结构校验（pnpm check:ui）
│   ├── scripts/agui-pipeline-check.ts  # HITL 审批管线校验（pnpm check:agui）
│   └── vite.config.ts                  # Tailwind 插件 + @ 别名 + /agui + /api 代理
├── dev/联调启动说明.md              # 本机模型（CPA）联调启动步骤
├── AGENTS.md                           # 工程规范（编程思想 / 完成定义）
├── CONTRIBUTING.md                     # 贡献指南
├── LICENSE                             # Apache-2.0
├── docs/requirements.md                # 需求与范围
├── docs/architecture.md                # 架构分层与核心原则
├── docs/roadmap.md                     # 路线图（已实现 / 待做）
├── docs/design.md                      # 功能设计（为什么这么设计）
├── docs/api.md                         # API 契约（REST + AG-UI）
├── docs/adr/                           # 技术决策记录（ADR）
├── docs/ui-guidelines.md               # 前端视觉 / 交互规范（唯一权威）
├── docs/verification-report.md         # 联调验证报告
├── docs/frontend-enhancement-report.md # 前端功能增强验证报告
├── docs/code-review-report.md          # 代码审查报告
├── docs/regression-checklist.md        # 回归验证清单（改动后重跑）
├── docs/testing-guide.md               # 自动化测试指南（三层金字塔 + 判绿标准）
├── docs/feature-inventory.md           # 功能清单（端点/前端/架构能力台账）
├── docs/verified-capabilities.md       # 已验证功能清单（只列实测通过的能力）
└── build.gradle.kts
```

## 工作区结构（AgentScope 标准）

每个 agent 在 `.agentscope/workspace/{agentId}/` 下有一套标准工作区。其中**人设 / 记忆模板 / 领域知识**纳入版本管理（见 `.gitignore`），其余为运行态、由 AgentScope 自动生成：

```
.agentscope/workspace/{agentId}/
├── AGENTS.md               # 人设：身份、职责、硬约束、约定（每次请求注入，保持精简）  ★版本管理
├── MEMORY.md               # 长期记忆起始模板（memory_save 维护，随使用增长）      ★版本管理
├── knowledge/KNOWLEDGE.md  # 知识索引：导航到具体主题文档，按需定点读取             ★版本管理
└── {threadId}/             # 运行态：每个会话一个隔离目录，按 threadId 命名（不入库）
    ├── agents/{AgentName}/sessions/{threadId}.jsonl      # 上下文转录（append-only，重建上下文的数据源）
    ├── agents/{AgentName}/sessions/{threadId}.log.jsonl  # 完整历史（含被上下文压缩裁掉的部分）
    ├── default/{AgentName}/{threadId}/events/*.jsonl     # EVENT_LOG：逐事件持久化
    └── memory/YYYY-MM-DD.md                              # 该会话的每日记忆账本
```

> `{AgentName}` 是 agent 的**显示名**（如 `Workmate` / `Coder` / `Explorer`），不是 `.agentscope` 目录名所用的 agentId。会话重启后仍可续聊，靠的就是这里的转录 JSONL —— 这也是"会话内容的真相来源"，而不是任何内存结构。

## 配置说明

### `agentscope.*`

```yaml
agentscope:
  agent:
    enabled: false            # 关闭官方默认 ReActAgent，agent 统一由 workmate.agents 声明
  model:
    provider: openai
  openai:
    api-key: ${OPENAI_API_KEY:}
    model-name: ${OPENAI_MODEL:gpt-4.1-mini}
    base-url: ${OPENAI_BASE_URL:}
    stream: true              # 流式输出，SSE 的前提
  agui:
    path-prefix: /agui
    default-agent-id: default # 必须是 workmate.agents 中的某个 key，未命中即启动失败
    enable-reasoning: true    # 输出 REASONING_MESSAGE_* 事件（前端思考卡片的数据源）
    emit-token-usage: true    # 输出 token 用量事件
    # server-side-memory 用官方默认值 false：见上文「状态存储」。开启后才会填充内存会话池。
```

`management.endpoints.web.exposure.include: "*"` 放开的只有 Spring Boot 内置端点（`health` / `info` / `metrics` / `loggers` / `mappings` / `scheduledtasks` / `threaddump` 等）。

### `workmate.agents.<id>`

key 同时是两处标识：agentId（`/api/agents` 里的 `id`）与 AG-UI 路由段（`/agui/run/{id}`）。

```yaml
workmate:
  agents:
    default:
      name: Workmate                                  # 显示名，也是 .agentscope 下 sessions 目录名
      sys-prompt: You are Workmate, a helpful general assistant.
      workspace: .agentscope/workspace/default
      permission-mode: default                        # 非只读工具走 HITL 审批
    coder:
      permission-mode: accept-edits                   # 工作区内编辑免审批
      enable-plan-mode: true
      max-iters: 30
    explorer:
      permission-mode: explore                        # 只读，任何写操作都拒绝
      max-iters: 15
```

未显式声明的项一律沿用 `HarnessAgent` 官方默认值。`permission-mode` 取值：`default` / `accept-edits` / `explore` / `bypass` / `dont-ask`。

## 本地开发

前置：JDK 25、Node 20+、pnpm 10。Gradle 的 Java toolchain 要求 25，若系统默认 JDK 不是 25，先设 `JAVA_HOME` 指向 JDK 25。

```bash
# 后端（8080）：配置真实 OpenAI 兼容模型
export OPENAI_API_KEY=sk-...
export OPENAI_BASE_URL=...        # 可选，默认官方端点
./gradlew.bat bootRun

# 前端（5173）
cd frontend && pnpm install && pnpm dev
```

打开 http://localhost:5173 。前端把 `/agui`（SSE）与 `/api`（管理 REST）都代理到 `http://localhost:8080`，所以只需启动后端即可，无跨域问题。

### 无 API Key 时的联调

不配 Key 也能启动，但发消息时模型调用会失败。联调需接入模型：`application.yaml` 的 `openai.base-url` 默认指向本机 CLIProxyAPI（CPA，`127.0.0.1:8317`）反代的 WorkBuddy 模型，启动步骤见 `dev/联调启动说明.md`。任何 OpenAI 兼容端点都能用同样的方式替换。

### 验证对话服务

不用浏览器也能冒烟：POST 一个 AG-UI `RunAgentInput`，观察 SSE 事件流是否完整：

```bash
curl -N http://localhost:5173/agui/run/default \
  -H 'Content-Type: application/json' -H 'Accept: text/event-stream' \
  -d '{"threadId":"t1","runId":"r1","tools":[],"context":[],"forwardedProps":{},"state":{},"messages":[{"id":"m1","role":"user","content":"你好"}]}'
```

无工具调用的纯回答，实测事件序列（`enable-reasoning=true`）：

```
RUN_STARTED
REASONING_MESSAGE_START → REASONING_MESSAGE_CONTENT ×9 → REASONING_MESSAGE_END
TEXT_MESSAGE_START     → TEXT_MESSAGE_CONTENT          → TEXT_MESSAGE_END
CUSTOM(name=token_usage)
RUN_FINISHED
```

触发工具调用时，工具结果回灌后模型会再跑一轮，因此 `REASONING_*` 与 `CUSTOM(token_usage)` 会各出现两次：

```
RUN_STARTED → REASONING_MESSAGE_* → TOOL_CALL_START → TOOL_CALL_ARGS ×3 → TOOL_CALL_END
            → CUSTOM(token_usage)                                  ← 第 1 次模型调用（决定调工具）
            → TOOL_CALL_RESULT                                     ← 工具真实执行结果回灌
            → REASONING_MESSAGE_* → TEXT_MESSAGE_* → CUSTOM(token_usage) → RUN_FINISHED
```

## 端点

### AG-UI（聊天，SSE）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/agui/run` | agentId 取自 `X-Agent-Id` 头或 `forwardedProps`，兜底 `default-agent-id` |
| POST | `/agui/run/{agentId}` | agentId 取自路径（前端使用的形式） |

### 业务 REST（`/api/*`，JSON）

前端经 Vite 代理访问同一路径，后端直连亦可用。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/agents` | agent 列表：`id` / `name` / `description` / `registered` / `permission` |
| DELETE | `/api/agents/{id}` | 从 AG-UI 注册表注销（可逆） |
| POST | `/api/agents/{id}/register` | 重新注册（与注销成对，避免不可逆操作） |
| GET | `/api/agents/{id}/skills` | 该 agent 的技能及来源仓库（`repositories` / `writable` / `deletable`） |
| DELETE | `/api/agents/{id}/skills/{name}` | 删除技能（**不可逆**；`archived` 字段仅反映官方 `delete()` 是否 move 到 `.archive/` 兜底） |
| GET | `/api/agents/{id}/sessions` | 该 agent 的全部会话（`sessionId` / `agentName` / `updatedAt`） |
| DELETE | `/api/agents/{id}/sessions/{sessionId}` | 删除会话的整个落盘目录（**不可逆**），返回 `removedFiles` |
| GET | `/api/jobs` | 定时任务列表（含 `id` / `agentId` / `cron` / `executions`） |
| POST | `/api/jobs` | 创建任务（`name` / `agentId` / `cronExpression`），成功返回 201 |
| DELETE | `/api/jobs/{name}` | 取消任务（幂等） |
| GET | `/api/jobs/{name}/executions` | 该任务的执行历史（最近 50 条：起止时间 / 状态 / 输出 / token） |

所有错误统一为 RFC 7807 `ProblemDetail`（含 `detail` 与 `instance`），前端 `ApiError` 直接展示 `detail`。详见 `docs/design.md`。

`/actuator` 只暴露 Spring Boot 内置端点，**没有** `agentscope-*` 端点（见上文依赖说明）。

## 生产单机部署

前端产物是纯静态文件，无需 Node 运行时：

```bash
cd frontend && pnpm build     # 产出 frontend/dist
```

将 `dist/` 交给 Nginx（或放进后端静态资源目录），把 `/agui` 与 `/api` 都反向代理到后端 8080 即可。Nginx 上需要为 SSE 关闭缓冲：

```nginx
location /agui {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_buffering off;      # SSE 必需
    proxy_read_timeout 3600s;
}
location /api {
    proxy_pass http://127.0.0.1:8080;
}
location / {
    root /var/www/workmate;
    try_files $uri /index.html;
}
```
