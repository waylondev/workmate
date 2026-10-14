# AG-UI 事件覆盖与缺口

> 记录后端（AgentScope 2.0.4）**实际发射**的 AG-UI 事件 vs 标准 AG-UI 协议，以及前端如何消费。
> 数据来源：`javap -p -c` 反编译 jar 字节码 + 真实模型抓 SSE 字节（临时产物在 `build/int/probe-*.txt`，未提交）。
> 本文是「事件级协议细节」的单一来源；架构级限制见 `design.md` §6，待办/不做见 `roadmap.md`。

## 一、事件覆盖矩阵（实测）

| 事件 | 标准 AG-UI | 后端实发 | 前端消费方式 |
|---|---|---|---|
| RUN_STARTED / RUN_FINISHED / RUN_ERROR | ✓ | ✓ | `@ag-ui/client` 适配器 |
| TEXT_MESSAGE_START / CONTENT / END | ✓ | ✓ | 适配器 |
| TOOL_CALL_START | ✓ | ✓（实测有） | 适配器 |
| TOOL_CALL_ARGS | ✓ | ✓（流式 delta 分片） | 适配器 |
| TOOL_CALL_END / TOOL_CALL_RESULT | ✓ | ✓ | 适配器 |
| STATE_SNAPSHOT / STATE_DELTA | ✓ | ✓ | 适配器 |
| CUSTOM `token_usage` | ✓（Custom） | ✓ | `ag-ui-runtime-provider.tsx` 订阅 |
| CUSTOM `subagent.*` | —（非标准） | ✓（默认透出） | `ag-ui-runtime-provider.tsx` 订阅 → `subagent.ts` |
| SUBAGENT_STARTED / FINISHED / ERROR | ✓（标准） | ✗ **不发** | —（前端不凭空渲染） |
| THINKING_TEXT_MESSAGE_* | ✓（标准） | ✗ **不发** | —（思考走 `subagent.thinking` Custom） |

## 二、subagent.* Custom 事件契约

AgentScope 的 `agent_spawn` 不发射标准 `SUBAGENT_*` 事件，而是经 `SubagentEventConverter`
把子智能体内部事件转成 `subagent.*` Custom（`SubAgentTool.forwardEvents` 默认 `true`）。
字段结构实测如下：

| 事件 name | `value.type` | 关键字段 |
|---|---|---|
| `subagent.lifecycle` | `AGENT_START` | `source`、`name`（子智能体名）、`replyId` |
| `subagent.thinking` | `THINKING_BLOCK_DELTA` | `source`、`delta` |
| `subagent.text` | `TEXT_BLOCK_DELTA` | `source`、`delta` |
| `subagent.tool_call` | `TOOL_CALL_START` / `TOOL_CALL_END` | `source`、`toolCallId`、`toolName` |
| `subagent.tool_result` | `TOOL_RESULT_END` | `source`、`toolCallId`、`toolName`、`state` |

`value.source` = `<threadId>/<子智能体名>`，用于唯一标识一次子智能体运行。

关键事实：

- **无 `AGENT_END`**：子智能体结束不单独发事件，前端用「父线程 `thread.isRunning` 变 false」判断结束。
- **历史会话不重放**：刷新 / 切回会话后，`subagent.*` 事件不会重新到达，因此子智能体**中间过程**
  只在实时流式期间可见；历史里只剩 `agent_spawn` 的最终 `result`。
- 前端累积逻辑在 `frontend/src/subagent.ts`（纯函数 `applySubagentEvent`），渲染在
  `frontend/src/components/subagent-activity.tsx`。

## 三、已知缺口

| # | 缺口 | 说明 |
|---|---|---|
| 1 | 无标准 SUBAGENT_* 事件 | 官方用 `subagent.*` Custom 替代，前端已纯消费（P0-1），**无需后端扩展** |
| 2 | 无 THINKING_TEXT_MESSAGE_* | 主 agent 思考走 `enable-reasoning` 的 reasoning part，子智能体思考走 `subagent.thinking` |
| 3 | 子智能体中间过程不跨刷新持久化 | 属事件流性质，非缺陷；最终结果仍在 `agent_spawn` result |
