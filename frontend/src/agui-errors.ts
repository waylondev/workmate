/**
 * AG-UI 运行失败的归类。
 *
 * <p>后端有两类「会话卡在待确认」的拒绝，都给不出可操作的出路：
 *
 * <ul>
 *   <li>`INVALID_INPUT_ERROR`（AgentScope harness 层）：该 (agentId, threadId) 的
 *       磁盘会话里存在没有结果的 `tool_use`（即曾经暂停等授权），本次请求没带确认。
 *       **典型成因是后端进程重启**——AG-UI 层的待决中断只存在内存里，磁盘会话态却还在；
 *       页面刷新后客户端同样丢失中断 id，结果一致。
 *   <li>`AGUI_INTERRUPT_CONTRACT_ERROR`（AG-UI 层）：本次进程内还记着待决中断，
 *       而请求的 `resume` 没有把全部中断覆盖到。
 * </ul>
 *
 * <p>两者都是「这条会话在服务端已经不可继续」的同一种处境，客户端能做的只有给出出路
 * （新建会话）。这类判定放在纯函数里，便于在无浏览器环境下直接断言，见
 * `scripts/agui-pipeline-check.ts`。
 */
export type AguiFailure = {
  /** 归类标识。 */
  kind: "stale-approval"
  /** 后端报文中列出的待确认工具名（可能为空）。 */
  pendingTools: string[]
  /** 面向用户的一句话说明。 */
  title: string
  /** 为什么会出现、该怎么办。 */
  detail: string
}

const PENDING_APPROVAL = /human-in-the-loop confirmation/i
const UNRESOLVED_INTERRUPTS = /unresolved interrupts/i
const TOOL_ENTRY = /([A-Za-z0-9_.-]+)\s*\(id=[^)]*\)/g

const messageOf = (error: unknown): string => {
  if (typeof error === "string") return error
  if (error instanceof Error) return error.message
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message)
  }
  return ""
}

const pendingToolsOf = (text: string): string[] => {
  const names = new Set<string>()
  for (const match of text.matchAll(TOOL_ENTRY)) {
    if (match[1]) names.add(match[1])
  }
  return [...names]
}

/**
 * 把一次运行失败归类；不属于「会话卡在待确认」的返回 null，交由原有错误展示处理。
 */
export const classifyAguiFailure = (error: unknown): AguiFailure | null => {
  const text = messageOf(error)
  if (!text) return null

  if (!PENDING_APPROVAL.test(text) && !UNRESOLVED_INTERRUPTS.test(text)) return null

  const pendingTools = pendingToolsOf(text)
  return {
    kind: "stale-approval",
    pendingTools,
    title: "这条会话还停在一次未完成的工具授权上",
    detail:
      "后端进程重启或页面刷新后，客户端与后端会各自丢掉一部分待确认状态，而磁盘上的会话仍记着那次未完成的授权，" +
      "因此这条会话无法继续。新建一条会话即可正常使用；原会话的记录仍保留在服务端。",
  }
}
