# Workmate 文档-代码一致性 & 全量回归报告

> 日期：2026-10-12
> 范围：文档与代码交叉核对 + 用户视角功能缺口 + 全量回归（23 项）+ 对齐清单
> 结论先行：**文档与代码整体一致**，仅 `design.md` 有 1 处分叉（服务端会话管理）+ 1 处缺失小节（MCP 连接器），均已修复；全量回归 **23/23 PASS**。

---

## 一、结论先行

| 项 | 结果 |
|---|---|
| 文档 vs 代码一致性 | ✅ 一致（修复 design.md 2 处分叉/缺失后） |
| 全量回归 | ✅ PASS 23 / FAIL 0 / SKIP 0 |
| 用户视角最高优先级缺口 | MCP 连接器运行时管理 + 前端配置面板（已入 roadmap P1-3） |
| 本次变更 | 仅文档（design.md / roadmap.md），代码未动，jar 与 HEAD 一致 |

---

## 二、一致性核对（docs vs code）

逐工件核对，结论如下：

| 文档 / 工件 | 核对点 | 结论 |
|---|---|---|
| `README.md` | 9 项核心功能（流式/HITL/subagent/定时/Multi-Agent/技能/MCP/会话/Agent 管理）vs 代码 | ✅ 一致 |
| `docs/api.md` | 全部 REST 端点清单 vs 控制器 | ✅ 一致（已含会话端点） |
| `docs/verified-capabilities.md` | 实测能力 vs 代码 + 人肉实测 | ✅ 一致 |
| `docs/feature-inventory.md` | 端点台账 + 覆盖标记 | ✅ 一致 |
| `docs/roadmap.md` | 已实现 / 待做 / 不做 vs 代码 | ✅ 一致（补 P1-3） |
| `docs/design.md` | §3.1 / §0 / §4 会话 + §3.3.2 MCP | ⚠️ 发现分叉 → ✅ 已修复 |
| `scripts/regression/run.sh` | 12 快速 / 23 全量计数 vs README | ✅ 一致（脚本实测 23/23） |

### 发现并修复的问题

**问题 1：design.md 服务端会话管理分叉（显著）**
- 现象：`design.md` §3.1 写「删除 `SessionController`」、§4 标「服务端会话列表与删除 ⬜ 未做（见 §3.1）」，但代码已实现 `SessionController.kt` + `SessionAdminService.kt`（P1-1，commit 6222325）；`README` / `api.md` / `verified-capabilities.md` / `feature-inventory.md` / `roadmap.md` 五处均标注已完成。
- 根因：`design.md` §3.1 仍停留在「早期删除读内存池的 SessionController」的旧叙事，未记录 P1-1 采用其自身推荐的「读真实转录目录」方案重新实现。
- 修复：
  - §3.1 改为「决策（演进）」：保留内存池死胡同的历史说明 + 说明 P1-1 按推荐方案（`SessionTree` 转录目录）重新实现列表/真删，附 `api.md`/`verified-capabilities.md` 交叉引用。
  - §0 会话行补充「服务端 `GET/DELETE /api/agents/{id}/sessions` 列表 / 真删（P1-1）」。
  - §4 该行改为 `✅ 已实测（见 §3.1）`。

**问题 2：design.md 缺失 §3.3.2（MCP 连接器）小节**
- 现象：`README` 把 MCP 列为头部能力、代码已接入（`AgentCatalog.configureTools → toolsConfig`）、「已确证官方 API」表有 MCP 行，但 `design.md` 无专门设计小节（§3.3.1 直接跳 §3.4）。
- 修复：新增 §3.3.2，含 `transport` 表（stdio/sse/streamableHttp）、per-agent 事实（反编译确证 `ownedMcpToolkit`）、当前静态声明边界、下一步指向 `roadmap.md` P1-3。

**问题 3：design.md ADR 链接**
- `adr/` → `docs/adr/`（目录实际位于 `docs/adr/`）。

---

## 三、用户视角功能缺口（优先级排序）

严格遵循项目「官方能力优先、不自己造」原则。优先级按「用户价值 × 官方可支撑度」排序。

| 优先级 | 功能 | 用户价值 | 官方能力支撑 | 备注 |
|---|---|---|---|---|
| **P1** | MCP 连接器运行时管理 + 前端配置面板 | 用户期望即插即用外部工具，而非改 yaml 重启后端 | 官方 `McpClientManager.registerMcpClient` / `removeMcpClient` / `getMcpClientNames` | 已入 `roadmap.md` P1-3；复用官方、不引新依赖 |
| **P2** | 技能可视化 + 草稿审批流 | 看不到 agent 沉淀了哪些技能、草稿待审批 | 官方 `SkillManageTool` / `ProposeSkillTool` 产出 `skills/_drafts`；`enableSkillPromotionGate` 可接审批 | 需补前端 UI + 接 promotionGate |
| **P2** | 对话 / 会话导出与分享 | 保存或分享一次 agent 会话 | 转录 JSONL 已落盘，导出为纯前端能力 | 低风险 |
| **P3** | MCP / 工具连通性自检 | 确认外部 MCP 真的连上 | 官方无现成探针，可基于 `getMcpClientNames` 自写轻量健康检查 | 复用官方 client manager |
| **P3** | 定时任务执行历史前端面板 | 后端已有 `GET /api/jobs/{name}/executions`，前端 AdminPanel 是否充分展示输出/token | 后端端点已有 | 补前端展示即可 |
| **P4** | 会话搜索 / 检索 | 会话增多后定位困难 | 转录目录已结构化 | 低风险 |
| 明确不做 | 多用户 / 鉴权、移动端响应式 | — | — | 沿用 `roadmap.md` N-2 / N-8（单机内部工具） |

> 关键判断：P1 / P2 均**复用官方扩展点或输出**，不违反 minimalist 原则；P3 以后为增强体验、无架构扩张。最该先做的只有 P1（MCP 运行时管理），因为它直接对应项目把自己定位为「Skill 平台 + 连接器」的核心卖点，而当前只能静态配置。

---

## 四、全量回归结果

- 命令：`bash scripts/regression/run.sh --full`
- 环境：后端 8080（JDK 25 + CPA 8317 真实 hy3 模型）/ 前端 5173 / CPA 8317，三端均 UP。
- **结果：PASS 23 | FAIL 0 | SKIP 0**

| 步骤 | 覆盖 | 项数 | 结果 |
|---|---|---|---|
| 0 构建门槛 | build.gradle.kts / frontend/package.json | 2 | ✅ |
| 1 三端健康 | health / 前端 200 / CPA 200·401 | 3 | ✅ |
| 2 Agent 管理 | 列表 / registered / 注销可逆 | 4 | ✅ |
| 3 定时任务 | 创建 / cron 真实触发 ≥2 / 执行历史含真实 token / 取消 | 5 | ✅ |
| 4 AG-UI SSE | RUN_STARTED / TEXT_MESSAGE / token_usage / RUN_FINISHED | 4 | ✅ |
| 5 子智能体 | agent_spawn 派发 / permission_confirm HITL 中断 | 2 | ✅ |
| 6 前端校验 | check:ui / check:agui（FAIL=0） | 2 | ✅ |
| 7 收尾 | 回归未产生污染文件 | 1 | ✅ |

- 实测证据：`build/int/regression-result.txt`、`build/int/regress-sse.txt`、`build/int/regress-sub.txt`。

### 覆盖缺口（诚实标注，非文档不一致）
回归脚本**未覆盖**会话列表/删除、技能列表/删除端点（`feature-inventory.md` §四 已如实标注为「人肉实测」）。建议下一步把这两项并入自动化回归（构造确定性 fixture），使「全部实测验证」完全可重复。

---

## 五、本次文档 / 代码对齐清单（已变更文件）

| 文件 | 变更 |
|---|---|
| `docs/design.md` | §0 会话行、§3.1「决策（演进）」、新增 §3.3.2 MCP 连接器、§4 P1-1 状态、ADR 链接 `docs/adr/` |
| `docs/roadmap.md` | 新增 P1-3（MCP 连接器运行时管理 + 前端配置面板） |
| 代码 | 未改动；`build/libs/*.jar` 与 HEAD（a783f7b）一致，无需重编译 |

---

## 六、视频交付

- **回归展示 MP4**：`docs/regression-showcase-2026-10-12.mp4`（基于本次 23/23 全绿结果，AI 生成的回归概览展示视频）。
- 说明：本环境浏览器自动化不可用，无法做真实 UI 录屏；真实页面录屏仍为 `docs/regression-demo.mp4`（2026-10-12 提交版）。如需最新真实录屏，按 `dev/联调启动说明.md` 在可运行浏览器的环境启动三端后捕获。
