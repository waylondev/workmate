// 本地会话目录：threadId → 展示信息。
//
// 这里只存**界面需要的目录**（标题、所属 agent、更新时间）到 localStorage；
// 真正的对话转录由后端官方 SessionTree 落盘在
// `.agentscope/workspace/{agentId}/{threadId}/agents/{AgentName}/sessions/{threadId}.jsonl`，
// 两者职责不重叠。因此在侧栏删除会话 = 从本地最近列表移除，**不影响服务端转录**。

export type ChatSession = {
  threadId: string
  agentId: string
  title: string
  updatedAt: number
}

const SESSIONS_KEY = "workmate-sessions"

export const UNTITLED = "新会话"

export function loadSessions(): ChatSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is ChatSession =>
        !!item &&
        typeof item === "object" &&
        typeof (item as ChatSession).threadId === "string" &&
        typeof (item as ChatSession).agentId === "string" &&
        typeof (item as ChatSession).title === "string" &&
        typeof (item as ChatSession).updatedAt === "number",
    )
  } catch {
    return []
  }
}

export function persistSessions(sessions: ChatSession[]): void {
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions))
  } catch {
    // 忽略配额 / 隐私模式失败：会话目录丢失只影响侧栏展示
  }
}

export function newThreadId(): string {
  return crypto.randomUUID()
}

/** 用首条用户消息给会话起标题（仅当仍是默认标题时）。 */
export function titleFromMessage(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim()
  return oneLine.length > 24 ? `${oneLine.slice(0, 23)}…` : oneLine
}
