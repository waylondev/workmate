# Workmate 前后端联调验证报告

> 验证时间：2026-10-11 20:29–20:33
> 验证对象：`build/libs/workmate-0.0.1-SNAPSHOT.jar`（2026-10-11 19:56 构建）+ `frontend` dev server
> 验证方式：真实模型端到端黑盒验证（CPA → hy3），非「只读代码」
> 一键复现：`bash build/int/verify-all.sh`（原始输出 `build/int/verify-all-result.txt`）

## 一、结论

**72 项通过 / 0 项失败 / 3 项需定夺。** 后端全部 11 个 HTTP 端点、AG-UI SSE 全事件链路、三个 agent 的路由与权限分流、定时任务到点真实触发、统一错误契约、前端三栏结构与模块转译，均已在真实模型链路上跑通。

3 项「需定夺」不是运行期故障，而是**同一处设计不一致**：`GET/DELETE /api/sessions` 挂在官方 `ThreadSessionManager` 上，而本项目按架构决策**不启用** `server-side-memory`，导致这两个端点在当前配置下结构性恒为空 / 恒无操作（详见 §三）。另发现 README 与 `docs/design.md` 的文档漂移（详见 §四）。

## 二、验证环境与链路

```
浏览器 (React 19 / assistant-ui)
  └─ Vite dev server  http://localhost:5173        ← Vite 代理 /agui 与 /api
       └─ Spring WebFlux  http://127.0.0.1:8080    ← 后端 jar
            └─ AgentScope HarnessAgent
                 └─ CPA (CLIProxyAPI)  http://127.0.0.1:8317/v1
                      └─ hy3（真实模型，支持推理 + 工具调用）
```

| 组件 | 端口 | PID | 状态 |
|---|---|---|---|
| 后端（fat jar） | 8080 | 12624 | `/actuator/health` = `{"status":"UP"}` |
| 前端（Vite dev） | [::1]:5173 | 17828 | 首页 200 |
| CPA 模型网关 | 127.0.0.1:8317 | 4224 | hy3 可用 |

> 环境注意：curl 访问内网地址须加 `--noproxy '*'`（否则被沙箱透明代理拦成 502）；Vite 只绑 IPv6，须用 `localhost` 而非 `127.0.0.1`。

## 三、结果总览

| 模块 | 项数 | PASS | FAIL | WARN | 结论 |
|---|---|---|---|---|---|
| A 服务可达性 / 代理 | 6 | 6 | 0 | 0 | ✅ |
| B Agent 管理 | 10 | 10 | 0 | 0 | ✅ |
| C 技能管理 | 11 | 11 | 0 | 0 | ✅ |
| D 会话 | 9 | 6 | 0 | 3 | ⚠️ 接口语义待定夺 |
| E 定时任务 | 11 | 11 | 0 | 0 | ✅ |
| F AG-UI SSE | 14 | 14 | 0 | 0 | ✅ |
| G 权限引擎（HITL） | 4 | 4 | 0 | 0 | ✅ |
| H 错误契约（RFC 7807） | 6 | 6 | 0 | 0 | ✅ |
| I 前端三栏结构 | 4 | 4 | 0 | 0 | ✅ |
| **合计** | **75** | **72** | **0** | **3** | |

---

## 四、逐功能验证

### A. 服务可达性与双通道代理（6/6）

**功能含义.** 开发期只暴露一个入口 `5173`：前端页面与两条代理通道都在同一源上，`/agui`（SSE 对话）与 `/api`（管理 REST）由 Vite 转发到后端 8080。这样前端代码里不需要写后端地址、不产生跨域，生产期把同一份约定换成 Nginx 反代即可（README 已给 SSE 关缓冲的配置）。「AG-UI 协议是前后端唯一契约」——两侧不共享任何业务代码。

**验证与证据.** 后端健康检查 200 且 `status=UP`；前端首页 200；`/api/agents` 经代理 200；`/agui/run/default` 经代理可达；另直连后端 `/api/agents` 200，说明代理只是便捷路径而非必需依赖（区分「代理故障」与「后端故障」）。

**结论.** ✅ 两条通道均通，单入口开发模式成立。

### B. Agent 管理（10/10）

**功能含义.** 这里必须分清**两个来源**，否则管理界面会说谎：agent **定义**来自 `workmate.agents` 配置（启动期由 `AgentCatalog` 构造并持有 `HarnessAgent`），而 `AguiAgentRegistry` 只记录**「是否注册到 AG-UI 路由」这一运行时状态**。因此列表同时返回 `registered`，注销（`DELETE /api/agents/{id}`）只是从路由注册表摘除、**可用 `POST /api/agents/{id}/register` 恢复**，定义不受影响。

三个 agent 的语义差异由配置决定：

| id | name | permission-mode | 其他 | 定位 |
|---|---|---|---|---|
| `default` | Workmate | `default` | — | 通用助手，非只读工具走 HITL 审批 |
| `coder` | Coder | `accept-edits` | `enable-plan-mode: true`、`max-iters: 30` | 编码，工作区内免审批 |
| `explorer` | Explorer | `explore` | `max-iters: 15` | 只读分析，不发起写操作 |

`agent id` 同时是三处标识：配置 key、AG-UI 路由段（`/agui/run/{id}`）、管理接口路径段。

**验证与证据.**

| 检查 | 实测 |
|---|---|
| 列表返回 3 个 agent，字段含 `registered` | ✅ `coder,default,explorer` |
| 启动即注册 | 三个 `registered=true` |
| 注销 explorer | `{"registered":false}` |
| 注销后路由是否真被拦住 | SSE 明确返回 `Agent not found: explorer`，**不是**静默失败 |
| 重新注册 | `{"registered":true}`，重发请求恢复 `RUN_FINISHED` |
| 未知 agent 注销 / 注册 | 均 404 |

**结论.** ✅ 注销**确实生效且可逆**。（此前缺陷：`DELETE` 只动 registry、而列表读 catalog，导致 UI 注销看不出效果且无法恢复；现已修好。）

### C. 技能管理（11/11）

**功能含义.** 技能的本体就是文件 —— `.agentscope/workspace/{agentId}/skills/<name>/SKILL.md`（YAML frontmatter + 指令体），文件系统即存储，无数据库。列表接口除了技能名，还返回**来源仓库**（`repositories[].source / type / location / writable / archivedOnDelete`），因为一个 agent 可能同时挂多个仓库（workspace 命名空间仓库、只读仓库……），**「从哪个仓库删、删得动删不动」必须对调用方透明**。

删除语义是**归档**而非硬删除：workspace 仓库会把技能移到 `skills/.archive/<name>-<ts>`，可恢复；响应里的 `archived` 字段如实反映本次是归档还是硬删除，不美化。

**验证与证据.**

| 检查 | 实测 |
|---|---|
| 新建 `skills/vfy-temp-skill/SKILL.md` 后列表 | 立即出现（热加载，无需重启） |
| 仓库信息 | 含 `repositories` 与 `writable` |
| 命名空间隔离 | `coder` 的技能列表看不到 `default` 的技能 |
| 删除响应 | `{"agentId":"default","skillName":"vfy-temp-skill","deleted":true,"repository":"workspace-namespaced","archived":true}` |
| 原目录 | 已移除 |
| 归档落点 | `skills/.archive/vfy-temp-skill-<ts>` 存在 |
| 删除不存在的技能 / 未知 agent 的技能列表 | 均 404 |

**结论.** ✅ 技能删除**真实生效**。（此前缺陷：`DELETE` 返回 `{"deleted":false}` 且文件不动 —— `HarnessAgent` 内部构造的 `WorkspaceSkillRepository` 是只读的，日志刷 `read-only; delete() ignored`；现已按归档语义修好。）

### D. 会话（6/9，3 项 WARN）

**功能含义 —— 两个层次的会话概念必须分清：**

1. **转录持久化（会话的「内容」）**：官方 `SessionTree` 按
   `.agentscope/workspace/{agentId}/{threadId}/agents/{AgentName}/sessions/{threadId}.jsonl`（上下文）与 `{threadId}.log.jsonl`（完整历史）**append-only 落盘**，进程重启不丢。同 threadId 的下一轮请求靠它恢复上下文 —— F14 多轮对话能续上就是走这条链路。
2. **服务端内存会话池（诊断视图）**：`ThreadSessionManager` 维护内存中 `threadId → agent 实例` 槽位，用于同 threadId 复用 agent；**仅进程内有效**，并有 `max-thread-sessions` / `session-timeout-minutes` 的 LRU 淘汰。它是诊断视图，**不是「用户全部会话列表」**。

前端另有一份**本地会话目录**（`sessions.ts`，localStorage，键 `workmate-sessions`）：只存界面需要的 `threadId / agentId / title / updatedAt`，标题由首条用户消息生成。三层职责不重叠：本地目录管展示，SessionTree 管内容，内存池管进程内复用。

**验证与证据.**

| 检查 | 实测 |
|---|---|
| 一轮会话收尾 | `RUN_FINISHED` ✅ |
| 转录落盘 | `.agentscope/workspace/default/vfy-session-<T>/agents/Workmate/sessions/vfy-session-<T>.jsonl`，非空 ✅ |
| `GET /api/sessions` 结构 | `{"activeSessions":0,"sessions":[]}` ✅（结构合法） |
| **池是否被填充** | ⚠️ **恒为 0** |
| `DELETE /api/sessions/{threadId}` | 200，`{"removed":false}` ⚠️ |
| 删内存槽位是否影响磁盘转录 | 不影响（职责边界清晰）✅ |

**⚠️ 待定夺（P2）：`/api/sessions` 在当前配置下是结构性死胡同。**

根因已定位到字节码级：官方 starter 的 `AguiProperties.serverSideMemory` 默认 `false`，且 `max-thread-sessions` 的元数据描述明确写着 *"Only used when serverSideMemory is enabled"*。本项目 `application.yaml` 未开启该开关，而 README 第 39 行**明确声明**「`HarnessAgent` 自带 EVENT_LOG 持久化，因此不启用 AG-UI 的 `server-side-memory`」。于是 `ThreadSessionManager` 从不被写入。

实证（用第二个实例开关对照，非推测）：

```bash
# 默认配置（当前）        → {"activeSessions":0,"sessions":[]}
# 加 --agentscope.agui.server-side-memory=true 后同一次调用 →
# {"activeSessions":1,"sessions":[{"threadId":"prb-ssm-1","userId":"__anon__",
#   "agentId":"default","name":null,"createdAt":"...","lastAccess":"...","archived":false}]}
```

即：`SessionController` 的实现正确，但**它暴露的是一个架构上刻意不启用的组件**。副作用是 `DELETE /api/sessions/{threadId}` 恒为 no-op（前端 `App.tsx` 里那座 fire-and-forget 调用因此永远是空转）；`api.ts` 的注释也承认 `GET /api/sessions` **当前无消费方**。

两个方向，取决于你的取舍（**未擅自改动**）：

- **(a) 推荐 — 移除**：删掉 `GET /api/sessions` 与 `DELETE /api/sessions/{threadId}`，同时去掉前端 `api.ts` 的 `deleteSession` 与 `App.tsx` 的调用。理由：会话内容真相在 SessionTree，这两个端点在 README 声明的架构下没有存在价值，留着只会让下一个人以为「会话列表该从这里读」。
- **(b) 保留但自证**：响应加 `"serverSideMemory": false` 字段，并在 `SessionController` KDoc 里写明「池仅在 server-side-memory 开启时有内容；本项目按设计未开启」。适合还想留个诊断口的情况。

> 顺带一个观察：显式传 `"userId":"local"` 时池内仍是 `__anon__`（`ThreadSessionManager.ANON_USER`）——AG-UI 的 `userId` 不在 `RunAgentInput` 顶层被读取。当前无实际影响（会话隔离靠 threadId），仅记录。

### E. 定时任务（11/11）

**功能含义.** 定时任务 = 一条 cron + 目标 agentId，到点触发该 agent 跑一次。管理面是薄层：创建（201）、列出（含 `id / agentId / cron / executions`）、取消（幂等）。`executions` 是「已触发次数」，也是**判断调度器是否真的在干活的唯一客观证据**。

**关键架构事实（已写入 UI 文案，避免误用）：** 官方 `agentscope-extensions-scheduler-quartz` 的 `BaseScheduleAgentTask.createAgent()` **每次触发都新建一个 `ReActAgent`**（只需 `name` + `sysPrompt` + `model`，可选 `toolkit/hooks`），**无法复用 `AgentCatalog` 里已装配好的 `HarnessAgent`**。因此定时任务**不享有** workspace、记忆、技能、权限引擎。这是官方扩展的接口形状决定的天花板，不是本项目漏配。

**验证与证据.**

| 检查 | 实测 |
|---|---|
| 非法 cron | **400** + RFC 7807 体（此前 500） |
| 未知 agent | **404**（此前 200 + `{"error"}`，前端会误判成功、清空表单且无提示） |
| 创建 | **201 Created**，响应含 `id/agentId/cron/executions` |
| 重名 | **409 Conflict** |
| 列表可见 | ✅ |
| **cron 真实触发** | 观察 35s（`0/10 * * * * ?`）：`executions` **1 → 4** |
| 取消 / 重复取消 | `{"cancelled":true}` / `{"cancelled":false}`（幂等） |
| 取消后列表 | 不再包含 |

**结论.** ✅ `executions 1→4` 证明调度器**真的到点建 agent 并打到模型**（不是只登记了一条记录）。

### F. AG-UI SSE（14/14）

**功能含义.** 这是前后端的**唯一契约**：后端只负责注册 agent 并输出事件流，前端只负责渲染，两侧不共享业务代码。前端 `HttpAgent` → `POST /agui/run/{agentId}`，事件与前端用途的对应关系：

| 事件 | 含义 | 前端用途 |
|---|---|---|
| `RUN_STARTED` / `RUN_FINISHED` | 一轮运行的边界 | pending 状态、断言一轮是否收尾 |
| `REASONING_MESSAGE_START/CONTENT/END` | 模型的思考过程（因 `enable-reasoning: true`） | 思考折叠卡片 |
| `TEXT_MESSAGE_START/CONTENT/END` | 回答正文的增量流 | 对话气泡正文 |
| `TOOL_CALL_START/ARGS/END/RESULT` | 工具调用的发起、参数增量、执行结果回灌 | **右侧「工作进度」面板的数据源** |
| `CUSTOM`（`name=token_usage`） | token 用量（因 `emit-token-usage: true`） | 用量统计 |
| `RAW`（内层 `REQUEST_STOP` + `generateReason`） | 框架请求暂停的原始事件 | HITL 审批触发点 |

**验证与证据**（真实模型 hy3，事件直方图）：

```
default（纯回答）    RUN_STARTED×1 → REASONING_MESSAGE_START×1 + CONTENT×9 + END×1
                     → TEXT_MESSAGE_START×1 + CONTENT×1 + END×1 → CUSTOM×1 → RUN_FINISHED×1

explorer（工具循环） RUN_STARTED×1 → REASONING×96 → TOOL_CALL_START×1 + ARGS×3 + RESULT×1
                     → REASONING×2 → TEXT_MESSAGE_*×138 → CUSTOM×2 → RUN_FINISHED×1
                     工具名：list_files
```

| 检查 | 实测 |
|---|---|
| 推理事件透传（思考卡片有数据） | ✅ |
| 回答文本流（正文有数据） | ✅ |
| token 用量事件 | ✅ |
| 工具调用全链路（发起→参数→**结果回灌**→仍有最终回答） | ✅ 工具 `list_files` 真实执行 |
| 三个 agent 路由均可用 | ✅ `default` / `coder` / `explorer` |
| 同 threadId 多轮（上下文复用） | ✅ 第二轮 `RUN_FINISHED`，无 `RUN_ERROR` |

> 方法学说明：`default` 的「回答文本」必须在**无工具调用**的 prompt 上验证 —— 它的 `permission-mode=default` 会让工具调用停在等审批处、本轮不产出正文。把工具循环放到 `explorer`（只读自动放行）上验证，才能观测到完整的「调用→执行→结果→回答」闭环。第一版脚本把两件事混在一个 prompt 上，误报了两项 FAIL，已修正。

**结论.** ✅ 全事件链路在真实模型上跑通。

### G. 权限引擎与 HITL 审批（4/4）

**功能含义.** 同一句 prompt，不同 agent 因 `permission-mode` 不同而走**不同的权限路径**：非只读操作会以 `permission_confirm`（SSE 里表现为 `REQUEST_STOP` + `generateReason=PERMISSION_ASKING`）回到前端，由人审批后才继续。这是「agent 能动手但要人点头」的安全阀。

**验证与证据**（同一 prompt「列出当前目录文件」，同一工具 `list_files`）：

| agent | permission-mode | 是否请求授权 | 是否真正执行 | 观测 |
|---|---|---|---|---|
| `default` | `default` | **是** | 否，停在等审批 | `PERMISSION_ASKING`（RAW/REQUEST_STOP） |
| `coder` | `accept-edits` | 否 | **是** | `TOOL_CALL_RESULT`，无审批事件 |
| `explorer` | `explore` | 否 | **是** | `TOOL_CALL_RESULT`，无审批事件 |

**结论.** ✅ 权限引擎按配置**真实分流**，不是装饰性配置项。

**已知契约行为（非缺陷）.** 带**未决审批**的 threadId 若未先 `resume` 就复用，框架按契约显式拒绝而非静默串味：

```
RUN_ERROR: Thread has unresolved interrupts; RunAgentInput.resume must address all of them
```

这不影响正常 UI 路径：前端 `components/tool-fallback.aui.tsx` 会渲染审批卡，并通过 `respondToApproval` / `addResult` 解决该 interrupt（提交历史 `2b81b01` 亦为修复工具审批 schema 报错）。**裸客户端（curl / 脚本）必须自行 resume**，本验证脚本因此在每轮用唯一 threadId 规避。

### H. 错误契约（6/6）

**功能含义.** 所有 `/api/*` 的错误统一为 **RFC 7807 ProblemDetail**：`detail` 是可直接展示给人看的原因，`instance` 指向出错的具体请求 URI。前端 `api.ts` 的 `ApiError` 把它抽出来，UI 因此能显示「agent not found: nope」而不是无信息量的「400 Bad Request」。这是「管理界面说实话」的地基 —— 失败必须能被看到。

**验证与证据.** 未知 agent 的技能列表 404、非法 cron 400、未知路径 404，响应体均含 `detail` 与 `instance`；重名任务 409（E6）。

**结论.** ✅ 全链路错误形态一致。（此前 `/api/*` 错误形态各异：200 + `error` 字段、500 裸异常。）

### I. 前端三栏结构（4/4）

**功能含义（对照豆包式布局改造）.** 页面为三栏：左栏导航 / 中栏对话 / 右侧「对话摘要」。

- **左栏 `AppSidebar`**：品牌行（Workmate + 收起）→ 功能导航（新建对话 / 定时任务 / 技能 / Agent 管理）→「工作区」段（三个 agent，点击即切换 `/agui/run/{id}`）→「最近」段（本地会话，悬停出现删除）→ 底部用户区 + 主题切换。可折叠。
- **中栏**：`ChatHeader`（展开侧栏 / 新建 / 会话标题 / 当前 agent 名 / 右栏开关）+ `Thread`（assistant-ui 官方组件）+ 输入区 `ComposerChips`（agent、权限、技能、工作进度四个 chip，点击定位到右栏对应段落）。
- **右栏 `ConversationSummaryPanel`「对话摘要」**：工作进度 / 对话产物 / 后台任务 / 技能 / 最近文件。

**关键设计（决定了右栏不会「演」）.** 右栏的**工作进度、对话产物、最近文件**全部是 `work-progress.ts` 里**从 AG-UI 线程消息派生的纯函数**（`deriveWorkSteps` / `deriveArtifacts` / `deriveRecentFiles`），不维护任何并行的猜测状态 —— 显示的就是真实 SSE 事件（工具调用 → 一步；运行中转圈、完成打勾、失败标红）。**后台任务、技能**则来自真实 `/api/jobs` 与 `/api/agents/{id}/skills`。会话标题由首条用户消息生成（仅提升本地目录，不碰后端转录）。

**验证与证据**（本机 Chromium 自动化不可用，采用「构建 + SSR 渲染 + 模块转译」间接覆盖）：

| 检查 | 实测 |
|---|---|
| 类型检查 + 产物构建 | `pnpm build`（`tsc -b` + `vite build`）通过 |
| 三栏结构 + 进度派生逻辑 | `pnpm check:ui`（react-dom/server 在真实模块图上渲染 App）**10 项断言全通过** |
| dev server 模块转译 | 本轮清单 **11/11** 全部 200（App / work-progress / sessions / chat-chrome / nav / agents / api / app-sidebar / conversation-summary-panel / composer-chips / ag-ui-runtime-provider） |
| 深色主题首帧 | `index.html` 首屏脚本读 `workmate-theme`，渲染产物应用 `dark`，无闪白 |

**结论.** ✅ 结构与派生逻辑成立。

> 说明：浏览器内的像素级/交互级验收（点击、滚动、审批卡实际点击）本机无法自动化，**未覆盖**。建议你在浏览器里过一遍三个高风险交互：① 切 agent 是否重挂载运行时；② default 触发工具时审批卡是否出现且可点；③ 右栏 chip 是否能定位到对应段落。

---

## 五、此前修复项的回归确认

| # | 原问题 | 现状 | 证据 |
|---|---|---|---|
| 1 | `DELETE /api/agents/{id}/skills/{name}` 静默失效（返回 `{"deleted":false}`，文件不动） | ✅ 已修 | C6/C7/C8/C9 |
| 2 | `POST /api/jobs` 未知 agent 返回 200 + `{error}`，前端误判成功 | ✅ 已修（404） | E3 |
| 3 | 非法 cron 返回 500（应 400） | ✅ 已修（400 + detail） | E1/E2 |
| 4 | `DELETE /api/agents/{id}` 只动 registry、列表读 catalog → 注销无效果且不可逆 | ✅ 已修（返回 `registered` + 可重新注册） | B5/B6/B7/B8 |
| 5 | `frontend/src/api.ts` 的 `listSessions` 死代码且类型不符 | ✅ 已移除 | `api.ts` §会话 注释 |
| 6 | `docs/design.md` §3.4 主张「Spring 自带调度、不引 Quartz」与实现矛盾 | ❌ 仍漂移 | 见 §六 |
| 7 | README 依赖表仍列 `agentscope-admin-spring-boot-starter` 与 `agentscope.admin.enabled` | ❌ 仍漂移 | 见 §六 |
| 8 | agent `description` 未传给前端 | ✅ 已修 | B2 |

## 六、文档漂移（P3，未擅自改动）

**`README.md`** —— 实测与描述不符：

| 位置 | README 描述 | 实测 |
|---|---|---|
| L36 / L124-125 | 依赖含 `agentscope-admin-spring-boot-starter`，配置 `agentscope.admin.enabled: true` | `build.gradle.kts` 无该依赖、`application.yaml` 无该配置 |
| L196 | 「管控端点：`GET /actuator/agentscope-agents`、`-usage`、`-models`…」 | `/actuator` 仅有标准 Spring Boot 端点（health/metrics/mappings…），**无任何 `agentscope-*`** |
| L65-84 目录结构 | 只有 `agent/` 包 | 实际还有 `job/ session/ skill/ web/` 与 `/api/*` 管理面 |
| L187 | 正常事件序列 `RUN_STARTED → TEXT_MESSAGE_START → …` | 因 `enable-reasoning: true`，实际为 `RUN_STARTED → REASONING_MESSAGE_* → TEXT_MESSAGE_* → CUSTOM(token_usage) → RUN_FINISHED` |
| L63 | 「顶栏用分段控件切换 agent」 | 已改为左栏「工作区」段 + 输入区 agent chip |

**`docs/design.md`** —— 与实现分叉较深：§3.4 主张「不引 Quartz」而实现用 Quartz；§3.1 列的 `POST /api/sessions`、`GET /api/sessions/{id}` 并不存在；§3.2 说 agent 可运行时增删改查（实际只切换注册状态，定义仍来自 yaml）；§3.3 的技能 REST 与实现不符；§「⚠️ 未确证点」章节与「分阶段实施计划」状态表（P1–P4 标「待做」，实际已完成）均已过时。

> 这是 cross-artifact 一致性问题：`docs / README / design / 实现` 之间存在事实性分叉。**是否需要我按实现现状校准这两份文档？（会改动 scope 之外的文档，先问再做。）**

## 七、已知限制与未覆盖项

| 项 | 状态 |
|---|---|
| 浏览器内像素级 / 交互级验收 | ❌ 未覆盖（本机 Chromium 自动化不可用），已用 SSR + 构建 + 转译间接覆盖 |
| 定时任务不享有 workspace / 记忆 / 技能 / 权限引擎 | ⚠️ 官方扩展的接口形状决定，非配置缺陷；已在 UI 文案写明 |
| 未决审批 interrupt 未 resume 即复用 threadId | ⚠️ 框架契约行为，前端已适配；裸客户端须自行 resume |
| `/api/sessions` 语义 | ⚠️ 待定夺（§四 D） |
| 文档漂移 | ⚠️ 待定夺（§六） |
| 高并发 / 多实例 | ❌ 未验证（单机内部工具定位，非当前目标） |

## 八、复现方式

```bash
# 前置：后端 8080、前端 5173、CPA 8317 均在运行
bash build/int/verify-all.sh            # 约 3 分钟（含 35s cron 观察窗）
cat build/int/verify-all-result.txt     # 完整输出

# 前端：类型检查 + 构建 + 三栏结构/派生逻辑 SSR 校验
cd frontend && pnpm build && pnpm check:ui
```

脚本要点（`build/int/verify-all.sh`）：A 服务可达性 / B Agent / C 技能 / D 会话 / E 定时任务 / F SSE / G 权限 / H 错误契约 / I 前端，共 75 项；每轮用唯一 threadId 避免上轮遗留的未决 interrupt 污染结果；结果分 `PASS` / `FAIL` / `WARN` 三档，`WARN` 用于「行为与接口语义不符、需人定夺」。
