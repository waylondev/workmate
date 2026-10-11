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
| `agentscope-admin-spring-boot-starter` | 管控面：`/actuator/agentscope-*` 端点（agents / models / usage / permissions / tools / status / drain / shutdown 等） |
| `agentscope-openai-spring-boot-starter` | OpenAI 兼容模型接入，自动配置 `Model` |

**状态存储**：使用 AgentScope 内置的文件型会话状态（默认实现，落盘在 `.agentscope/`），无需外部数据库。`HarnessAgent` 自带 EVENT_LOG 持久化，因此不启用 AG-UI 的 `server-side-memory`。

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

`src/components/` 下的浅色 UI 组件（thread / reasoning / tool-fallback / tool-group / markdown-text / attachment 等）由 assistant-ui 官方 CLI 生成，属仓库自有源码，可直接改样式。

`src/agents.ts` 是前端的 agent 目录（与后端 `workmate.agents` 一一对应），顶栏用分段控件切换 `default / coder / explorer`；切换时以 `key` 重挂载运行时，每个 agent 是一段独立会话。

## 目录结构

```
workmate/
├── src/main/kotlin/org/waylon/workmate/
│   ├── WorkmateApplication.kt          # 启动类
│   └── agent/
│       ├── WorkmateProperties.kt       # workmate.* 顶层配置
│       ├── AgentProperties.kt          # 单个 agent 的配置项
│       ├── AgentCatalog.kt             # 按配置构造并持有全部 HarnessAgent
│       └── AgentConfiguration.kt       # 注册到 AG-UI 与 admin 两个官方注册表
├── src/main/resources/application.yaml # 全部运行时配置
├── frontend/                           # 前端工程（独立根目录）
│   ├── src/ag-ui-runtime-provider.tsx  # AG-UI 运行时接入
│   ├── src/agents.ts                   # 前端 agent 目录（顶栏切换用）
│   ├── src/components/                 # assistant-ui CLI 生成的聊天组件
│   ├── src/lib/utils.ts                # cn 工具
│   └── vite.config.ts                  # Tailwind 插件 + @ 别名 + /agui 代理
├── dev/mock-openai-server.mjs          # 本地 mock 模型（无 API Key 联调用）
└── build.gradle.kts
```

## 工作区结构（AgentScope 标准）

每个 agent 在 `.agentscope/workspace/{agentId}/` 下有一套标准工作区。其中**人设 / 记忆模板 / 领域知识**纳入版本管理（见 `.gitignore`），其余为运行态、由 AgentScope 自动生成：

```
.agentscope/workspace/{agentId}/
├── AGENTS.md        # 人设：身份、职责、硬约束、约定（每次请求注入，保持精简）
├── MEMORY.md        # 长期记忆起始模板（memory_save 维护，会随使用增长）
├── memory/          # 记忆碎片 + 每日账本（运行态，memory_save 自动写入）
├── knowledge/       # 领域知识（版本管理）
│   └── KNOWLEDGE.md # 知识索引：导航到具体主题文档，按需定点读取
├── skills/          # 技能（运行态 / 按需）
├── rules/           # 规则（可选）
├── sessions/        # 会话转录（运行态）
└── tasks/           # 任务（运行态）
```

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
    stream: true
  agui:
    path-prefix: /agui
    default-agent-id: default # 必须是 workmate.agents 中的某个 key，启动期有断言
    enable-reasoning: true    # 输出思考过程事件
    emit-token-usage: true
  admin:
    enabled: true             # 开启 /actuator/agentscope-* 管控端点
```

### `workmate.agents.<id>`

key 同时是三处标识：agentId、AG-UI 路由段（`/agui/run/{id}`）、admin 注册表 key。

```yaml
workmate:
  agents:
    default:  { name: Workmate, permission-mode: default }
    coder:    { permission-mode: accept-edits, enable-plan-mode: true, max-iters: 30 }
    explorer: { permission-mode: explore, max-iters: 15 }
```

未显式声明的项一律沿用 `HarnessAgent` 官方默认值。

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

打开 http://localhost:5173 。前端把 `/agui` 代理到 `http://localhost:8080`，所以只需启动后端即可，无跨域问题。

### 无 API Key 时的联调

不配 Key 也能启动，但发消息时模型调用会失败。仓库自带了本地 mock 模型，用于验证完整链路：

```bash
# 1. 起 mock（11434，返回 OpenAI 兼容 SSE 流）
node dev/mock-openai-server.mjs

# 2. 后端指向 mock（另开终端）
export OPENAI_API_KEY=mock-key
export OPENAI_BASE_URL=http://127.0.0.1:11434/v1
./gradlew.bat bootRun

# 3. 前端照常
cd frontend && pnpm dev
```

mock 会回显你的问题并返回一段固定文案，证明 `AG-UI SSE → HarnessAgent → Model` 全链路可用。

### 验证对话服务

不用浏览器也能冒烟：POST 一个 AG-UI `RunAgentInput`，观察 SSE 事件流是否完整：

```bash
curl -N http://localhost:5173/agui/run/default \
  -H 'Content-Type: application/json' -H 'Accept: text/event-stream' \
  -d '{"threadId":"t1","runId":"r1","tools":[],"context":[],"forwardedProps":{},"state":{},"messages":[{"id":"m1","role":"user","content":"你好"}]}'
```

正常时应依次输出 `RUN_STARTED → TEXT_MESSAGE_START → TEXT_MESSAGE_CONTENT* → TEXT_MESSAGE_END → RUN_FINISHED`。

## AG-UI 端点

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/agui/run` | agentId 取自 `X-Agent-Id` 头或 `forwardedProps`，兜底 `default-agent-id` |
| POST | `/agui/run/{agentId}` | agentId 取自路径（前端使用的形式） |

管控端点：`GET /actuator/agentscope-agents`、`/actuator/agentscope-usage`、`/actuator/agentscope-models` 等。写操作（drain / shutdown / abort）受 `agentscope.admin.write-enabled` 控制，默认关闭。

## 生产单机部署

前端产物是纯静态文件，无需 Node 运行时：

```bash
cd frontend && pnpm build     # 产出 frontend/dist
```

将 `dist/` 交给 Nginx（或放进后端静态资源目录），把 `/agui` 反向代理到后端 8080 即可。Nginx 上需要为 SSE 关闭缓冲：

```nginx
location /agui {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_buffering off;      # SSE 必需
    proxy_read_timeout 3600s;
}
location / {
    root /var/www/workmate;
    try_files $uri /index.html;
}
```
