// 从 assistant-ui 线程状态派生的共享类型。
//
// 这些类型直接取自 `AssistantState["thread"]["messages"]`，不复制一份并行定义，
// 避免与库版本漂移。多个派生模块（work-progress / approvals）共用，杜绝重复。

import type { AssistantState } from "@assistant-ui/react"

export type ThreadMessages = AssistantState["thread"]["messages"]
export type ThreadMessage = ThreadMessages[number]
export type ThreadPart = ThreadMessage["parts"][number]
export type ToolCallPart = Extract<ThreadPart, { type: "tool-call" }>
