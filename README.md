# Workmate

企业级 Agent 底座：以 [AgentScope](https://github.com/agentscope-ai/agentscope-java) 为内核、AG-UI 协议为唯一契约的智能体应用。后端 Spring WebFlux 承载 Agent 并输出 SSE 事件流，前端 React + assistant-ui 渲染流式对话、思考过程、工具调用与人机审批。

<video src="docs/showcase.mp4" autoplay loop muted playsinline width="100%"></video>

> 上图（真实页面录屏，非 AI 生成）：流式对话 + 思考卡片 + token 统计 → HITL 审批横幅 → 子智能体实时进度面板 → 多 Agent 切换 → 会话持久化（切回验证记忆）→ 定时任务 / 技能 / Agent 管理页 → `?` 快捷键帮助。录制脚本：`bash scripts/regression/record-demo.sh`。

## 核心功能（全部实测验证）

| 能力 | 说明 |
| --- | --- |
| 流式对话 | AG-UI over SSE：思考卡片 / 工具卡 / token 统计全程可视化 |
| 人机协同（HITL） | 非只读操作被权限引擎拦为 `permission_confirm`，前端横幅审批（允许 / 全部允许 / 拒绝） |
| 子智能体 | 统一 `agent_spawn` 工具派发 subagent，高风险操作同样走审批 |
| 定时任务 | cron 驱动 Agent 自动执行，官方 Quartz 扩展 + 执行历史（状态 / 输出 / token）落盘 |
| 多 Agent | YAML 声明式目录（`default` / `coder` / `explorer`…），按 agent 隔离工作区与权限模式 |
| 技能系统 | 复用官方 `AgentSkillRepository`：枚举 / 删除（归档语义）；可选开启「技能自管理 + 策展」（agent 沉淀经验为技能） |
| 连接器（MCP） | 官方 `ToolsConfig.mcpServers` 声明式接入外部 MCP server（stdio / sse / streamableHttp），per-agent 独立 |
| 会话管理 | 转录 JSONL 落盘为真相来源，重启续聊；列表 / 删除（真删服务端目录） |
| Agent 管理 | 注销 / 重新注册（官方 `AguiAgentRegistry`，可逆） |

> 逐项实测证据见 `docs/verified-capabilities.md`；一键回归见 `scripts/regression/run.sh`。

## 技术栈

**后端**：Kotlin 2.3 · JDK 25 · Spring Boot 4.1（WebFlux 响应式）· AgentScope Java 2.0.4（harness + AG-UI starter + OpenAI starter + Quartz scheduler）· Gradle Kotlin DSL

**前端**：React 19 · TypeScript · Vite · Tailwind CSS 4 · assistant-ui（`@assistant-ui/react` + `react-ag-ui` 适配器）· pnpm

**协议**：前后端唯一契约是 **AG-UI over SSE**，两侧不共享任何业务代码。

## 设计思想

1. **协议即契约** — 后端只注册 Agent 并输出 AG-UI 事件流，前端只渲染事件。新增业务能力走 `/api/*` REST，永远不碰协议本身。
2. **薄层原则** — 项目代码只做官方能力的"胶水"：job/ 是官方 Quartz 扩展上的薄层，skill/、session/ 直接复用官方 Repository。不重造轮子，所有官方 API 均经 javap 反编译确证后才使用。
3. **磁盘即真相** — 无外部数据库。会话转录 JSONL、任务定义、执行历史全部落盘 `.agentscope/`，重启即恢复；不启用内存会话池。
4. **诚实的验证文化** — 功能"写好了"≠"验证过了"。`docs/verified-capabilities.md` 只列实测通过的能力；一键回归脚本自动判 PASS/FAIL，FAIL>0 禁止提交。

## 快速开始

前置：JDK 25、Node 20+、pnpm 10。

```bash
# 后端（8080）：任意 OpenAI 兼容模型
export OPENAI_API_KEY=sk-...
export OPENAI_BASE_URL=...        # 可选
./gradlew.bat bootRun

# 前端（5173）
cd frontend && pnpm install && pnpm dev
```

打开 http://localhost:5173 （前端已把 `/agui` 与 `/api` 代理到 8080）。

一键回归（三端启动后）：

```bash
bash scripts/regression/run.sh          # 快速：12 项瞬时检查
bash scripts/regression/run.sh --full   # 全量：23 项，含真实模型调用 / cron 触发 / subagent
```

## 多 Agent 配置（`application.yaml`）

```yaml
workmate:
  agents:
    default:
      permission-mode: default        # 非只读工具走 HITL 审批
    coder:
      permission-mode: accept-edits   # 工作区内编辑免审批
      enable-plan-mode: true
    explorer:
      permission-mode: explore        # 只读，任何写操作都拒绝
```

`permission-mode`：`default` / `accept-edits` / `explore` / `bypass` / `dont-ask`。

## 生产部署

前端产物为纯静态文件：`cd frontend && pnpm build`，将 `dist/` 交 Nginx，`/agui`（关闭 `proxy_buffering`）与 `/api` 反代到后端 8080 即可。

## 文档

| 文档 | 内容 |
| --- | --- |
| `docs/architecture.md` / `docs/design.md` | 架构分层 / 功能设计 |
| `docs/api.md` | REST + AG-UI 契约 |
| `docs/verified-capabilities.md` | 已验证功能清单（权威快照） |
| `docs/feature-inventory.md` | 端点级功能台账 + 覆盖矩阵 |
| `docs/testing-guide.md` | 测试金字塔 + 判绿标准 |
| `docs/ui-guidelines.md` | 前端视觉 / 交互规范 |

## License

Apache-2.0
