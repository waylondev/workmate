# 功能清单（Feature Inventory）

> workmate 的**能力台账**：逐条列出已实现的端点、前端能力、架构能力，并标注「覆盖它的测试」。
> 用途：验收时对照打勾；改动时定位影响面。与 `testing-guide.md`（怎么测）、`regression-checklist.md`（人肉验收）配套。
>
> 覆盖标记：`L1`=后端单测 · `L2`=前端静态校验 · `L3f`=回归脚本快速 · `L3F`=回归脚本全量 · `—`=暂无自动化覆盖（靠人肉回归清单）。

---

## 一、后端 REST 端点

### 1. Agent 管理 `/api/agents`

| 端点 | 方法 | 功能 | 关键语义 | 覆盖 |
|---|---|---|---|---|
| `/api/agents` | GET | 列出 catalog 全部 agent | 返回 `id/name/description/registered/permission` | L3f |
| `/api/agents/{id}` | DELETE | 注销 agent（从 AG-UI 路由移除） | 幂等；agent 不存在→404；**可逆** | L3f |
| `/api/agents/{id}/register` | POST | 重新注册 agent | 恢复 `/agui/run/{id}` 路由 | L3f |

### 2. Skill 管理 `/api/agents/{agentId}/skills`

| 端点 | 方法 | 功能 | 关键语义 | 覆盖 |
|---|---|---|---|---|
| `/api/agents/{agentId}/skills` | GET | 列出 agent 可见技能 | 含来源仓库/可写性/删除语义 | — |
| `/api/agents/{agentId}/skills/{name}` | DELETE | 删除技能 | 归档或硬删除（`archived` 字段如实反映）；只读→409 | — |

### 3. 会话管理 `/api/agents/{agentId}/sessions`

| 端点 | 方法 | 功能 | 关键语义 | 覆盖 |
|---|---|---|---|---|
| `/api/agents/{agentId}/sessions` | GET | 列出 agent 真实会话 | 来自服务端转录落盘 | — |
| `/api/agents/{agentId}/sessions/{sessionId}` | DELETE | 删除会话转录文件 | **不可逆**；不存在→404 | — |

### 4. 定时任务 `/api/jobs`

| 端点 | 方法 | 功能 | 关键语义 | 覆盖 |
|---|---|---|---|---|
| `/api/jobs` | POST | 注册 cron 任务 | `{name, agentId, cronExpression}`；重名→409、agent 不存在→404、非法 cron→400 | L3F |
| `/api/jobs` | GET | 列出任务 | 含 `executions` 计数 | L3F |
| `/api/jobs/{name}` | DELETE | 取消任务 | 幂等；`cancelled` 反映是否真取消 | L3F |
| `/api/jobs/{name}/executions` | GET | 任务执行历史 | 新的在前；含 status/output/token | L3F |

### 5. 对话路由 `/agui/run/{agentId}`（AG-UI over SSE）

| 路由 | 方法 | 功能 | 关键语义 | 覆盖 |
|---|---|---|---|---|
| `/agui/run/{agentId}` | POST | 流式对话 | SSE 事件流；`agentId ∈ {default,coder,explorer}` | L3F |

### 6. 运维 `/actuator/*`

| 端点 | 功能 | 覆盖 |
|---|---|---|
| `/actuator/health` | 存活/就绪探针（`status:UP`） | L3f |

---

## 二、前端能力

| 能力 | 文件 | 说明 | 覆盖 |
|---|---|---|---|
| 三栏布局 | `components/app-sidebar.tsx` 等 | 侧栏 → 中栏 → 摘要面板 | L2 `check:ui` |
| HITL 审批卡 | `ag-ui-runtime-provider.tsx` / `approvals.ts` | Allow/Deny 工具授权 | L2 `check:agui` |
| SSE 包装 | `agui-sse.ts` | 剔除 `expiresAt:null` 防 zod 崩溃 | L2 `check:agui` |
| 失败归类 | `agui-errors.ts` | 识别「卡在待授权」并给出路 | L2 `check:agui` |
| 思考折叠卡 | `components/reasoning.aui.tsx` | 推理事件展示 | — |
| 工具调用卡 | `components/tool-*.tsx` | 工具名/参数/结果展示 | L2 `check:ui` |
| 管理面板 | `AdminPanel.tsx` | agent/skill/session/job 管理 UI | — |
| 双主题 | `theme-toggle.tsx` | 深色/浅色切换 | L2 `check:ui`（部分） |
| 工作进度 | `work-progress.ts` | 步骤/锚点进度 | L2 `check:ui` |

---

## 三、架构能力

| 能力 | 说明 | 覆盖 |
|---|---|---|
| Agent 目录 | `AgentCatalog` 启动期构建，key=agent id | L3f |
| 运行时注册表 | `AguiAgentRegistry` register/unregister | L3f |
| 权限引擎 | `permission-mode`（default/accept-edits/explore）二值决策 → HITL | L2 `check:agui` |
| subagent 派发 | 统一 `agent_spawn` 工具 + 高风险写操作拦为 `permission_confirm` | L3F |
| cron 调度 | Quartz 扩展，每次触发新建 ReActAgent | L3F |
| 执行历史 | `ExecutionRecordingHook` 无状态 append + 落盘 | L3F |
| 会话转录 | 服务端落盘 `.agentscope/workspace/*` | — |
| 技能仓库 | 归档语义（`skills/.archive/`） | — |

---

## 四、覆盖缺口（已知无自动化）

以下能力目前**没有**自动化测试，仅靠 `regression-checklist.md` 人肉覆盖。按影响排序：

1. **Skill 删除**：`DELETE /api/agents/{id}/skills/{name}` 有**已知缺陷**（`WorkspaceSkillRepository` 只读，删除静默失效返回 `deleted:false`）——见 MEMORY「待办/漂移」。**不建议在此修复前写自动化**，写了会固化错误行为。
2. **Session 删除**：不可逆，需谨慎验证（避免误删真实会话）。
3. **会话列表**：依赖真实对话产生转录，难做确定性单测。
4. **思考折叠 / 工具卡视觉**：纯展示，无逻辑分支。

---

## 五、维护约定

- 新增端点 → 同步更新本表 + `api.ts` 类型 + `regression-checklist.md` 对应步骤。
- 新增能力 → 标注覆盖层级；若属可确定逻辑，优先补 L1/L2 自动化而非依赖人肉。
- 本表「覆盖」列只写**已实测通过**的测试，禁止把「应该能测」写成「已覆盖」。
