// 子智能体事件累积（纯函数 reducer）。
//
// AgentScope 2.0.4 的 agent_spawn 把子智能体内部事件经 `subagent.*` CUSTOM
// 事件流式透出（lifecycle/thinking/text/tool_call/tool_result）。这些事件不会
// 进入 assistant-ui 的 thread.messages（适配器不认识非标准事件），所以这里
// 单独累积，供对话区实时展示子智能体的思考 / 正文 / 工具调用。
//
// 数据契约（实测 SSE 字节）见 docs/agui-gaps.md。

export type SubagentToolCallStatus = "running" | "done" | "failed"

export type SubagentToolCall = {
  id: string
  name: string
  status: SubagentToolCallStatus
  resultState?: string
}

export type SubagentRun = {
  /** 唯一标识：事件的 `source` 字段（`<threadId>/<name>`）。 */
  id: string
  /** 子智能体名（展示用）。 */
  name: string
  /** 累积的思考文本。 */
  thinking: string
  /** 累积的正文。 */
  text: string
  /** 子智能体的工具调用。 */
  toolCalls: SubagentToolCall[]
}

/** `subagent.*` CUSTOM 事件的 `value` 字段（实测 AgentScope 2.0.4 payload）。 */
export type SubagentEventValue = {
  source?: string
  type: string
  delta?: string
  name?: string
  toolCallId?: string
  toolName?: string
  state?: string
}

/** 从 `source`（`<threadId>/<name>`）取末段作为子智能体名。 */
const nameFromSource = (source: string): string =>
  source.split("/").pop() ?? source

/** 空白 run 的构造，避免分支里重复字面量。 */
const emptyRun = (id: string, name: string): SubagentRun => ({
  id,
  name,
  thinking: "",
  text: "",
  toolCalls: [],
})

/**
 * 把一条 `subagent.*` 事件应用到子智能体运行列表，返回新列表（不可变）。
 *
 * <p>无 `source` 的事件无法归属到具体子智能体，直接忽略（流式场景容错优先，
 * 不抛错）。
 */
export function applySubagentEvent(
  runs: readonly SubagentRun[],
  value: SubagentEventValue,
): SubagentRun[] {
  const source = value.source
  if (!source) return runs.slice()

  const index = runs.findIndex((run) => run.id === source)

  // 子智能体开始：用事件自带 name 新建（或重置）一个 run。
  if (value.type === "AGENT_START") {
    const run = emptyRun(source, value.name ?? nameFromSource(source))
    if (index >= 0) {
      const next = runs.slice()
      next[index] = run
      return next
    }
    return [...runs, run]
  }

  // 事件先于 AGENT_START 到达（异常序）：兜底新建一个空 run 再套用本事件。
  const existing = index >= 0 ? runs[index] : undefined
  const run = existing ?? emptyRun(source, nameFromSource(source))

  let updated: SubagentRun
  switch (value.type) {
    case "THINKING_BLOCK_DELTA":
      updated = { ...run, thinking: run.thinking + (value.delta ?? "") }
      break
    case "TEXT_BLOCK_DELTA":
      updated = { ...run, text: run.text + (value.delta ?? "") }
      break
    case "TOOL_CALL_START":
      updated = {
        ...run,
        toolCalls: [
          ...run.toolCalls,
          {
            id: value.toolCallId ?? `${run.id}:tool-${run.toolCalls.length}`,
            name: value.toolName ?? "tool",
            status: "running" as const,
          },
        ],
      }
      break
    case "TOOL_CALL_END":
      updated = {
        ...run,
        toolCalls: run.toolCalls.map((toolCall) =>
          toolCall.id === value.toolCallId
            ? { ...toolCall, status: "done" as const }
            : toolCall,
        ),
      }
      break
    case "TOOL_RESULT_END":
      updated = {
        ...run,
        toolCalls: run.toolCalls.map((toolCall) =>
          toolCall.id === value.toolCallId
            ? {
                ...toolCall,
                status: (value.state === "SUCCESS" ? "done" : "failed") as SubagentToolCallStatus,
                ...(value.state !== undefined && { resultState: value.state }),
              }
            : toolCall,
        ),
      }
      break
    default:
      // 未识别的事件类型（如 require_confirm 等）：原样忽略。
      return runs.slice()
  }

  if (index >= 0) {
    const next = runs.slice()
    next[index] = updated
    return next
  }
  return [...runs, updated]
}
