// 聊天页外壳上下文：让「中栏之外的组件」（输入区工具条等）也能拿到 agent 切换与右栏定位能力，
// 而无需把 App 的状态一层层透传进官方 Thread 组件。
//
// 未挂 Provider 时（例如单独渲染 Thread）`useChatChrome()` 返回 null，消费方自行降级——
// thread.aui.tsx 因此保持可用且不依赖本文件。

import { createContext, useContext, type ReactNode } from "react"

/** 右侧摘要面板中可被定位的段落。 */
export type PanelSection = "progress" | "artifacts" | "jobs" | "skills" | "files"

export type ChatChrome = {
  /** 当前会话使用的 agent（决定 `/agui/run/{id}`）。 */
  agentId: string
  onAgentChange: (agentId: string) => void
  /** 展开右侧摘要面板，并滚动到指定段落。 */
  revealPanel: (section?: PanelSection) => void
  /** 打开「技能」等管理页。 */
  onNav: (key: "skills" | "jobs" | "agents") => void
}

const ChatChromeContext = createContext<ChatChrome | null>(null)

export function ChatChromeProvider({
  value,
  children,
}: {
  value: ChatChrome
  children: ReactNode
}) {
  return <ChatChromeContext.Provider value={value}>{children}</ChatChromeContext.Provider>
}

export function useChatChrome(): ChatChrome | null {
  return useContext(ChatChromeContext)
}
