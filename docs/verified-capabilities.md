# 已验证功能清单（Verified Capabilities）

> 本清单只列**已实现 + 已实测验证**的能力，是 workmate 当前真实可用范围的权威快照。
> 「验证方式」一栏标注证据来源，禁止把「代码写好了」写成「验证过了」。
>
> 最后实测：2026-10-12（后端 8080 / 前端 5173 / CPA 8317，hy3 真实模型）。

---

## 一、核心对话链路（✅ 全链路实测通过）

| 能力 | 说明 | 验证方式 |
|---|---|---|
| 流式对话 | `/agui/run/{agentId}` SSE 完整事件流 | 回归 `--full` + 真实模型实测 |
| 推理思考展示 | `REASONING_MESSAGE_*` 事件透传 | 实测 SSE 含推理事件 |
| 工具调用闭环 | 调用→执行→结果→回答 | subagent 实测出现 `glob_files`/`read_file`/`agent_spawn` |
| Token 用量统计 | `token_usage` 事件，累计会话级 | 实测 `cumulative` 字段非零 |
| 权限审批（HITL） | 非只读操作拦为 `permission_confirm` 中断 | subagent 实测 `permission_confirm` 事件 |

## 二、Agent 管理（✅ 实测通过）

| 端点 | 功能 | 实测结果 |
|---|---|---|
| `GET /api/agents` | 列出 3 个 agent（default/coder/explorer） | 返回完整 `registered`/`permission` ✅ |
| `DELETE /api/agents/{id}` | 注销（路由下线） | 注销后 `/agui/run/{id}` 返回 `not found` ✅ |
| `POST /api/agents/{id}/register` | 重新注册（路由恢复） | 重注册后路由恢复 ✅ |

> 官方支持依据：`AguiAgentRegistry.unregister(String)` / `register(String, Agent)` 已反编译确证。

## 三、定时任务（✅ 全链路实测通过）

| 端点 | 功能 | 实测结果 |
|---|---|---|
| `POST /api/jobs` | 注册 cron 任务 | 创建成功 ✅ |
| `GET /api/jobs` | 列出任务（含触发计数） | `executions` 计数正确 ✅ |
| `GET /api/jobs/{name}/executions` | 执行历史 | 返回真实记录（status/token）✅ |
| `DELETE /api/jobs/{name}` | 取消任务 | `cancelled:true` ✅ |

> cron 真实触发验证：每 5 秒任务实际触发并记录执行历史（真实 token）。

## 四、子智能体派发（✅ 实测通过）

| 能力 | 说明 | 实测结果 |
|---|---|---|
| subagent 派发 | 统一 `agent_spawn` 工具 | 实测 `toolCallName:"agent_spawn"` + `agent_id:"code-review"` ✅ |
| HITL 审批拦截 | 高风险写操作 → `permission_confirm` | 实测中断事件返回前端 ✅ |

## 五、会话管理（✅ 实测通过）

| 端点 | 功能 | 实测结果 |
|---|---|---|
| `GET /api/agents/{id}/sessions` | 列出真实会话 | 返回历史会话（sessionId/agentName/updatedAt）✅ |
| `DELETE /api/agents/{id}/sessions/{sid}` | 删除会话 | `deleted:true` + `removedFiles` ✅；不存在→404 ✅ |

## 五·五、技能管理（✅ 实测通过）

| 端点 | 功能 | 实测结果 |
|---|---|---|
| `GET /api/agents/{id}/skills` | 列出可见技能 | 返回技能 + 来源仓库 + `deletable` 标记 ✅ |
| `DELETE /api/agents/{id}/skills/{name}` | 删除技能 | `deleted:true` + `archived:true`，文件物理归档到 `.archive/` ✅ |

> 历史 P1 缺陷（`WorkspaceSkillRepository` 只读导致删除静默失效）**已修复**：`SkillAdminService` 用官方 `setWriteable(true)` 临时打开写开关。反编译确证 `AgentSkillRepository.setWriteable/isWriteable/delete` 官方接口存在。

## 六、前端（✅ 静态校验通过）

| 能力 | 验证方式 |
|---|---|
| 三栏布局 + 思考卡 + 工具卡 | `check:ui` 14 项全过 |
| HITL 审批管线 + SSE 包装 + 失败归类 | `check:agui` 16 项全过 |
| 类型检查 + 构建 + lint | `tsc --noEmit` / `vite build` / `oxlint` 全过 |

## 七、运维

| 能力 | 实测结果 |
|---|---|
| 健康探针 `/actuator/health` | `{"status":"UP"}` ✅ |

---

## 附：能力边界（诚实标注）

- 所有上述能力均**官方 API 支持**（已反编译确证 `AguiAgentRegistry.unregister/register`、`AgentSkillRepository.setWriteable/delete` 等），无「官方不支持却硬造」的功能。
- 技能仓库为**运行期可扫描**（实测运行中新建技能后 `GET /skills` 能列出，无需重启后端），但技能文件必须带 YAML front matter（`name`+`description`），否则被拒绝加载（官方约束）。
- 技能删除为**归档**语义（移到 `.archive/<name>-<ts>`），官方无 unarchive，删除即不可恢复——前端应如实提示。
