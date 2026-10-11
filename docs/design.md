# Workmate 功能设计文档

> 状态：**API 已确证**（基于 javadoc.io 官方 harness 2.0.0 Javadoc + fat jar 反查）
> 原则：**不引入数据库**，存储完全基于 AgentScope 官方能力，只在官方「积木」之上搭薄层。

## ★ 最终技术决策（2026 确认）

1. **不使用 `agentscope-admin`**：它是 MVC（Servlet）栈，与本项目 WebFlux 冲突，且只提供「运维观测」（actuator + 注册表 + 用量 + Swagger），不含业务 CRUD。已确认 Maven 上无 admin 的 WebFlux 变体。
2. **复用 AgentScope 底层 Bean（栈无关）**，在 WebFlux 里写薄 REST 暴露：
   - 会话管理 → `ThreadSessionManager`（agui-starter 注册的 Bean）+ `SessionTree`（JSONL 持久化）
   - Agent 枚举 → `AguiAgentRegistry` / `AgentRegistry`
   - Skill → `HarnessAgent.getSkillRepositories()` / `WorkspaceSkillRepository`
   - 定时任务 → `agentscope-extensions-scheduler-quartz`（官方扩展，2.0.4）
3. **Ollama 接入修正**：官方存在 `agentscope-ollama-spring-boot-starter`（2.0.4），可替代当前「OpenAI 兼容端点」方案（可选优化，当前配置可跑）。

### 官方模块全景（Maven Central `io.agentscope` 2.0.4 已确证存在）

| 需求 | 官方模块 |
|---|---|
| Ollama 模型 | `agentscope-ollama-spring-boot-starter` |
| 会话持久化切 DB/Redis | `agentscope-extensions-session-mysql` / `session-redis` |
| SKILL 多后端 | `agentscope-extensions-skill-mysql-repository` / `postgresql` / `git-repository` |
| 定时任务 | `agentscope-extensions-scheduler-quartz` / `scheduler-xxl-job` |
| 管理面（未成熟） | `agentscope-extensions-controlplane`（2.1.0-BETA1） |

## ★ 已确证的官方 API（决定架构）

AgentScope Java 版（`io.agentscope`）官方已内置以下能力，**无需自造存储层**：

| 能力 | 官方类/方法 | 说明 |
|---|---|---|
| 会话持久化 | `SessionTree`（`io.agentscope.harness.agent.memory.session`） | 按 `agents/{agentId}/sessions/{sessionId}.jsonl`（上下文）+ `.log.jsonl`（完整历史）持久化，append-only JSONL |
| 会话隔离 | `HarnessAgent.call(String, RuntimeContext)` | 每个 call 用 `RuntimeContext(userId, sessionId)` 隔离状态，同 session 串行、跨 session 并行 |
| 会话列表/历史/搜索 | `SessionSearchTool.sessionList/sessionHistory/sessionSearch` | 现成的 `session_list`/`session_history`/`session_search` 工具 |
| 技能 | `HarnessAgent.getSkillRepositories()` / `promoteSkill()` / `SkillCurator` / `ProposeSkillTool` | 技能自学习循环 + 提审 + 审计 |
| Agent 状态/会话 | `AgentStateStore`、`getStateStore()`、`workspaceFor(userId, sessionId)` | 状态与工作区按会话绑定 |
| 定时任务 | `agentscope-extensions-scheduler`（官方扩展模块） | 需单独引入 |

---

## 0. 现状与目标

### 现状（已核实代码）
- 后端：Kotlin + Spring Boot 4 + WebFlux + AgentScope 2.0.4（`io.agentscope`）
- 前端：React 19 + Vite + assistant-ui + AG-UI
- 已具备：聊天链路（前端 `/agui/run/{id}` → Vite 代理 → 后端 → HarnessAgent → 模型）
- Agent 定义写死在 `application.yaml`（default/coder/explorer）+ 前端 `agents.ts`
- 无会话列表/新建、无 Agent/SKILL/定时任务管理

### 目标功能
1. 新会话（会话列表 + 新建 + 切换/恢复）
2. Agent 专家管理（运行时增删改查）
3. SKILL 管理（增删、启用/停用、绑定 agent）
4. 定时任务（页面配置 cron，到点触发 agent）

---

## 1. 存储决策（已定）

**不引入数据库。** 理由：

1. **最重的「会话状态/记忆/上下文」** —— AgentScope 官方 `JSONSession` + `StateModule` 已用 JSON 文件搞定，无需 DB。
2. **SKILL 天然是文件** —— `SKILL.md` 目录即技能本体，文件系统是唯一合理存储。
3. **Agent/定时任务定义是低频小体量配置** —— yaml/JSON 文件足够。
4. **单机内部工具，无高并发/多实例共享需求** —— DB 无收益。

**扩展性保障**：业务层只依赖「仓储接口」（Repository），当前用「文件实现」，未来若真需 DB，新增一个实现类 + 一个配置开关切换，业务层零改动。

---

## 2. 总体架构

```
┌─────────────────────────────────────────────┐
│                 前端 (React)                 │
│  聊天页 / 会话列表 / Agent管理页 / SKILL页 / │
│              定时任务页                       │
└──────────────────┬──────────────────────────┘
                   │ /agui (SSE, 聊天)  +  /api/* (管理 REST)
┌──────────────────▼──────────────────────────┐
│              后端 (Spring Boot WebFlux)       │
│                                              │
│  REST Controller (薄层)                       │
│    └─ 依赖 Repository 接口                    │
│                                              │
│  Repository 接口 (稳定抽象)                   │
│    SessionRepo / AgentRepo / SkillRepo /     │
│    JobRepo                                   │
│    ├─ File 实现 (JSON 文件)  ← 当前           │
│    └─ (未来) DB 实现                           │
│                                              │
│  AgentScope 官方能力 (不重造)                 │
│    ├─ JSONSession / StateModule (会话状态)    │
│    ├─ HarnessAgent.builder() (构建 agent)     │
│    ├─ AgentRegistry (注册/观测)               │
│    └─ Toolkit.register_agent_skill (技能)     │
└─────────────────────────────────────────────┘
```

**核心原则**：
- 会话**状态**（对话内容/记忆/上下文）→ 交给 AgentScope 官方，不自己存。
- 业务**元数据**（会话列表、agent 定义、skill 绑定、任务定义）→ 走 Repository 接口，当前文件实现。
- 前端 `/agui` 聊天 + `/api/*` 管理两条路径分离。

---

## 3. 功能设计

### 3.1 新会话（会话管理）

**官方能力**（需确认 Java 版 API 名）：
- `JSONSession.save_session_state(sessionId, ...)` / `load_session_state(sessionId, ...)`
- `StateModule` 自动状态管理（记忆、系统提示词、工具集、上下文）

**我们需要补的薄层**：
- 会话**元数据**（id、标题、agentId、创建/更新时间）→ `SessionRepo` 文件实现。
- REST：
  - `POST /api/sessions` 新建（返回 sessionId）
  - `GET /api/sessions` 列表
  - `GET /api/sessions/{id}` 历史消息
  - `DELETE /api/sessions/{id}`
- 前端：
  - 引入 `react-router`（当前无路由）
  - 左侧会话列表栏 + 「+ 新建会话」按钮
  - `AgUiRuntimeProvider` 的 `threadId` 从 `crypto.randomUUID()` 改为「选定会话 ID」

**关键改动点**：`ag-ui-runtime-provider.tsx` 第 26 行 `threadId: crypto.randomUUID()` → 改为外部传入的 sessionId。

### 3.2 Agent 专家管理

**官方能力**：
- `HarnessAgent.builder()...build()` 构建 agent
- `AgentRegistry.register(id, agent)` / 注销

**我们需要补的薄层**：
- agent 定义从「启动期读 yaml 一次性构建」改为「可运行时增删改查」。
- `AgentRepo` 文件实现（存 agent 定义 JSON），启动时加载 → 构建 → 注册；运行时写操作后重建 + 重新注册。
- REST：`GET/POST/PUT/DELETE /api/agents`
- 前端：Agent 管理页（表格 + 表单），`agents.ts` 硬编码改为从后端拉取。

**注意**：`AgentCatalog` 当前是不可变单例（`val agents`），需改为可变 + 并发安全（`ConcurrentHashMap`），增删时正确调用 `HarnessAgent.close()` 释放资源。

### 3.3 SKILL 管理

**官方能力**（需确认 Java 版 API 名）：
- `Toolkit.register_agent_skill(dir)`
- `Toolkit.remove_agent_skill(name)`
- `get_agent_skill_prompt()`

**我们需要补的薄层**：
- 技能目录：`.agentscope/skills/{name}/SKILL.md`（YAML frontmatter + 指令），可带脚本/资源。
- `SkillRepo` 文件实现：扫描目录 = 列表，目录 + SKILL.md = 技能本体。
- skill ↔ agent 绑定关系存 JSON（`SkillRepo` 内）。
- REST：`GET/POST/PUT/DELETE /api/skills` + `PUT /api/agents/{id}/skills` 绑定
- 前端：SKILL 管理页（列表 + 上传 SKILL.md + 绑定 agent）

**注意**：需确认 Java 版 `HarnessAgent` 的 Toolkit 是否暴露 skill 注册 API（Python 版是 `Toolkit.register_agent_skill`，Java 版方法名可能不同）。

### 3.4 定时任务

**官方能力**：无（AgentScope 不提供调度）

**我们需要补**：
- 用 Spring 自带调度（**不引 DB、不引 Quartz**）：`@EnableScheduling` + `ThreadPoolTaskScheduler`，动态注册/取消 `ScheduledFuture`。
- `JobRepo` 文件实现：任务定义（id、name、cron、目标 agentId、prompt、启用状态、上次执行结果）。
- REST：`GET/POST/PUT/DELETE /api/jobs`，写操作后重新调度。
- 执行逻辑：到点触发目标 `HarnessAgent` 跑一次（复用现有 run 能力），记录结果。
- 前端：定时任务页（cron 输入 + 任务列表 + 启停）。

**选型理由**：Spring `TaskScheduler` 支持动态 cron 增删，够用且零额外依赖；Quartz 需持久化、较重，单机场景不必要。

---

## 4. 分阶段实施计划

| 阶段 | 内容 | 依赖 | 状态 |
|---|---|---|---|
| P0 | 联调 Ollama | 无 | ✅ 配置已改，待实测 |
| P1 | 会话管理（新会话 + 列表 + 历史恢复，官方 SessionTree 已内置） | 无 | ⬅️ **当前优先** |
| P2 | Agent 管理（动态构建 + 注册 + 管理页） | P1 | 待做 |
| P3 | SKILL 管理（官方 SkillCurator/promoteSkill + 管理页） | P2 | 待做 |
| P4 | 定时任务（agentscope-extensions-scheduler 或 Spring TaskScheduler） | P2 | 待做 |

---

## 5. API 确证结论（替代原「待确认清单」）

以下均已在 javadoc.io（harness 2.0.0）确证，**不再阻塞实现**：

- ✅ 会话持久化 = `SessionTree`（非 Python 版的 `JSONSession`）。文件：`agents/{agentId}/sessions/{sessionId}.jsonl` + `.log.jsonl`。
- ✅ 会话隔离 = `HarnessAgent.call(String, RuntimeContext)`，`RuntimeContext` 携带 `(userId, sessionId)`。AG-UI 层需把前端 `threadId` 映射为 `sessionId`。
- ✅ 技能 = `HarnessAgent.getSkillRepositories()` / `promoteSkill(name, reviewerId)` / `SkillCurator` / `ProposeSkillTool`（非 Python 版 `register_agent_skill`）。
- ✅ 会话列表/历史 = `SessionSearchTool.sessionList/sessionHistory/sessionSearch`（现成工具，非自建 REST）。
- ⚠️ 仍待验证（次要，P2/P3 时才需要）：
  - `AgentRegistry`（agui-starter 侧）是否支持运行时注销；
  - `HarnessAgent.close()` 幂等性。

> 注：fat jar 内版本为 2.0.4，Javadoc 站「latest」显示 2.0.0，两者 API 高度一致；实现时以 2.0.4 实际 class 为准。

---

## 6. 实现状态（已写代码，待编译验证）

### 已完成（代码已落盘）

**后端（新增/修改）**
| 文件 | 作用 |
|---|---|
| `src/main/kotlin/org/waylon/workmate/session/SessionController.kt` | 会话删除 + 数量（注入官方 `ThreadSessionManager` Bean） |
| `src/main/kotlin/org/waylon/workmate/agent/AgentAdminController.kt` | agent 列表 + 注销（注入官方 `AguiAgentRegistry`） |
| `src/main/kotlin/org/waylon/workmate/skill/SkillController.kt` | skill 列表 + 删除（复用 `AgentSkillRepository`） |
| `src/main/kotlin/org/waylon/workmate/job/JobSchedulerConfiguration.kt` | 定时调度 Bean（官方 `QuartzAgentScheduler`） |
| `src/main/kotlin/org/waylon/workmate/job/JobController.kt` | 定时任务 REST（创建/列表/取消） |
| `AgentCatalog.kt` / `AgentConfiguration.kt` | 移除 admin `AgentRegistry` 依赖 |
| `build.gradle.kts` | 移除 admin starter，新增 `agentscope-extensions-scheduler-quartz` |
| `application.yaml` | 移除 `agentscope.admin` 配置块 |

**前端（修改/新增）**
| 文件 | 作用 |
|---|---|
| `ag-ui-runtime-provider.tsx` | `threadId` 从随机 UUID 改为外部传入的可持久化 sessionId |
| `App.tsx` | 会话列表侧栏 + 新建/切换/删除 + localStorage 持久化 + 管理入口切换 |
| `api.ts`（新增） | 封装后端 `/api/*` REST（会话/Agent/Skill/定时任务） |
| `AdminPanel.tsx`（新增） | 管理面板：Agent 管理 / Skill 管理 / 定时任务三个 tab |
| `vite.config.ts` | 增加 `/api` 代理到后端 8080 |

### 前端接入链路（已完成代码层打通）

- 前端 `api.ts` → `/api/*`（经 Vite 代理）→ 后端 Controller → 官方 Bean（ThreadSessionManager / AguiAgentRegistry / AgentSkillRepository / QuartzAgentScheduler）
- 会话列表：前端 localStorage 维护清单元数据；会话内容由后端 SessionTree 自动持久化（按 threadId 关联）
- 删除会话：前端调 `DELETE /api/sessions/{threadId}`（后端 ThreadSessionManager.removeSession）

### ⚠️ 未确证点（需本机 `gradlew build` 验证后微调）

以下 API 基于 1.0.12 javadoc + 子代理查证（非 2.0.4 字节码级确认），编译时可能需调整 import 或方法名：

1. `ThreadSessionManager` 的包名 `io.agentscope.spring.boot.agui.common.ThreadSessionManager`（2.0.4 是否仍在此包）
2. `AguiAgentRegistry` 的包名 `io.agentscope.core.agui.registry.AguiAgentRegistry`
3. scheduler 的 `ScheduleConfig.Builder.cronExpression(...)` / `AgentConfig.Builder.agentFactory(...)` 精确方法名
4. `HarnessAgent.description` 是否 nullable（`AgentAdminController` 里 `agent.description ?: ""` 用了 elvis）

### 验证步骤（本机执行）

```powershell
# 后端编译
.\gradlew build

# 前端编译
cd frontend && pnpm build
```

> 注：本会话 pwsh 工具持续崩溃（exit 0xC0000142），无法本地执行编译验证，上述代码未经编译。
