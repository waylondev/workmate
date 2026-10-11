import type { ThreadMessages, ToolCallPart } from "@/thread-types"

/**
 * 一条待用户决策的工具授权。
 *
 * <p>「待授权」的判定标准：工具调用部件上挂着 `approval`，且 `approved` 仍是
 * `undefined`（既没批准也没拒绝，也没有 resolution 落定）。这与工具卡里
 * `status.type === "requires-action"` 互为表里，但这里直接从消息树派生，
 * 因此顶部横幅不必依赖工具卡的渲染。
 */
export type PendingApproval = {
  /** approval.id，即 respondToToolApproval 的 approvalId。 */
  approvalId: string
  /** 请求授权的工具名，用于向用户说明「卡在哪个工具」。 */
  toolName: string
  /** 后端给的提示文案（可选）。 */
  prompt?: string
}

/**
 * 从线程消息里派生全部待授权项。
 *
 * <p>遍历所有 assistant 消息的 `tool-call` 部件，凡 `approval` 存在且
 * `approved === undefined` 且没有 `resolution` 的，都算待授权。顺序即消息顺序。
 */
export function derivePendingApprovals(
  messages: ThreadMessages,
): PendingApproval[] {
  const pending: PendingApproval[] = []
  for (const message of messages) {
    if (message.role !== "assistant") continue
    for (const part of message.parts) {
      if (part.type !== "tool-call") continue
      const approval = (part as ToolCallPart).approval
      if (
        approval == null ||
        approval.approved !== undefined ||
        approval.resolution !== undefined
      ) {
        continue
      }
      pending.push({
        approvalId: approval.id,
        toolName: part.toolName,
        prompt: approval.prompt,
      })
    }
  }
  return pending
}
