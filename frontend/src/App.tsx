import { AgUiRuntimeProvider } from "@/ag-ui-runtime-provider"
import { AGENTS, agentById } from "@/agents"
import { deleteSession as deleteSessionRemote } from "@/api"
import { AdminPanel } from "@/AdminPanel"
import { ChatChromeProvider, type ChatChrome, type PanelSection } from "@/chat-chrome"
import { AppSidebar } from "@/components/app-sidebar"
import { ConversationSummaryPanel } from "@/components/conversation-summary-panel"
import { Thread } from "@/components/thread.aui"
import { TooltipIconButton } from "@/components/tooltip-icon-button"
import { TooltipProvider } from "@/components/ui/tooltip"
import { NAV_TITLES, type NavKey } from "@/nav"
import {
  loadSessions,
  newThreadId,
  persistSessions,
  titleFromMessage,
  UNTITLED,
  type ChatSession,
} from "@/sessions"
import { useAuiState } from "@assistant-ui/react"
import { PanelLeftIcon, PanelRightIcon, SquarePenIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"

/**
 * 三栏外壳：左侧导航 / 中栏对话 / 右侧「对话摘要」。
 *
 * <p>左侧栏与右侧面板都可折叠；右侧面板与中栏共享同一个 AG-UI 运行时，
 * 因此「工作进度」直接来自真实 SSE 事件，而不是另建一套状态。
 */
export default function App() {
  const [agentId, setAgentId] = useState(AGENTS[0].id)
  const [nav, setNav] = useState<NavKey>("chat")
  const [sessions, setSessions] = useState<ChatSession[]>(() => loadSessions())
  const [threadId, setThreadId] = useState<string>(() => {
    const existing = loadSessions()
    return existing.length > 0 ? existing[0].threadId : newThreadId()
  })
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [panelOpen, setPanelOpen] = useState(true)

  useEffect(() => {
    persistSessions(sessions)
  }, [sessions])

  const currentSession = useMemo(
    () => sessions.find((session) => session.threadId === threadId),
    [sessions, threadId],
  )
  const activeAgentId = currentSession?.agentId ?? agentId

  const createSession = () => {
    const id = newThreadId()
    setSessions((prev) => [
      { threadId: id, agentId: activeAgentId, title: UNTITLED, updatedAt: Date.now() },
      ...prev,
    ])
    setThreadId(id)
    setNav("chat")
  }

  const switchSession = (id: string) => {
    const session = sessions.find((item) => item.threadId === id)
    if (!session) return
    setThreadId(id)
    setAgentId(session.agentId)
    setNav("chat")
  }

  const deleteSession = (id: string) => {
    void deleteSessionRemote(id).catch(() => {
      // 服务端会话池是诊断视图，删除失败不阻塞本地目录清理
    })
    setSessions((prev) => {
      const next = prev.filter((session) => session.threadId !== id)
      if (id === threadId) {
        const fallback = next[0]
        if (fallback) {
          setThreadId(fallback.threadId)
          setAgentId(fallback.agentId)
        } else {
          setThreadId(newThreadId())
        }
      }
      return next
    })
  }

  const handleAgentChange = useCallback(
    (id: string) => {
      setAgentId(id)
      setSessions((prev) =>
        prev.map((session) =>
          session.threadId === threadId ? { ...session, agentId: id } : session,
        ),
      )
    },
    [threadId],
  )

  /** 首条用户消息落定后，把默认标题换成消息摘要（仅在标题仍是默认值时）。 */
  const applyTitle = useCallback((targetThreadId: string, text: string) => {
    const title = titleFromMessage(text)
    if (!title) return
    setSessions((prev) =>
      prev.map((session) =>
        session.threadId === targetThreadId && session.title === UNTITLED
          ? { ...session, title, updatedAt: Date.now() }
          : session,
      ),
    )
  }, [])

  const revealPanel = useCallback((section?: PanelSection) => {
    setPanelOpen(true)
    if (!section) return
    // 面板可能刚挂载，等一帧再滚动到目标段落
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document
          .getElementById(`summary-${section}`)
          ?.scrollIntoView({ behavior: "smooth", block: "start" })
      })
    })
  }, [])

  const chrome = useMemo<ChatChrome>(
    () => ({
      agentId: activeAgentId,
      onAgentChange: handleAgentChange,
      revealPanel,
      onNav: (key) => setNav(key),
    }),
    [activeAgentId, handleAgentChange, revealPanel],
  )

  return (
    <TooltipProvider>
      <div className="bg-background flex h-dvh">
        {sidebarOpen && (
          <AppSidebar
            nav={nav}
            onNav={setNav}
            sessions={sessions}
            currentThreadId={threadId}
            agentId={activeAgentId}
            onNewChat={createSession}
            onSwitchSession={switchSession}
            onDeleteSession={deleteSession}
            onAgentChange={handleAgentChange}
            onCollapse={() => setSidebarOpen(false)}
          />
        )}

        <div className="flex min-w-0 flex-1">
          {nav === "chat" ? (
            <AgUiRuntimeProvider key={threadId} agentId={activeAgentId} threadId={threadId}>
              <ChatChromeProvider value={chrome}>
                <SessionTitler threadId={threadId} onTitle={applyTitle} />

                <div className="flex min-w-0 flex-1 flex-col">
                  <ChatHeader
                    title={currentSession?.title ?? UNTITLED}
                    agentName={agentById(activeAgentId).name}
                    sidebarOpen={sidebarOpen}
                    panelOpen={panelOpen}
                    onToggleSidebar={() => setSidebarOpen((open) => !open)}
                    onTogglePanel={() => setPanelOpen((open) => !open)}
                    onNewChat={createSession}
                  />
                  <div className="min-h-0 flex-1">
                    <Thread components={{ Welcome: () => <Welcome agentId={activeAgentId} /> }} />
                  </div>
                </div>

                {panelOpen && (
                  <ConversationSummaryPanel
                    agentId={activeAgentId}
                    onClose={() => setPanelOpen(false)}
                  />
                )}
              </ChatChromeProvider>
            </AgUiRuntimeProvider>
          ) : (
            <div className="flex min-w-0 flex-1 flex-col">
              <AdminHeader
                nav={nav}
                sidebarOpen={sidebarOpen}
                onToggleSidebar={() => setSidebarOpen((open) => !open)}
              />
              <div className="min-h-0 flex-1">
                <AdminPanel initialTab={nav} />
              </div>
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}

function ChatHeader({
  title,
  agentName,
  sidebarOpen,
  panelOpen,
  onToggleSidebar,
  onTogglePanel,
  onNewChat,
}: {
  title: string
  agentName: string
  sidebarOpen: boolean
  panelOpen: boolean
  onToggleSidebar: () => void
  onTogglePanel: () => void
  onNewChat: () => void
}) {
  return (
    <header className="border-border/60 bg-background/80 flex h-14 shrink-0 items-center gap-1 border-b px-3 backdrop-blur">
      {!sidebarOpen && (
        <TooltipIconButton tooltip="展开侧栏" onClick={onToggleSidebar} aria-label="展开侧栏">
          <PanelLeftIcon />
        </TooltipIconButton>
      )}
      <TooltipIconButton tooltip="新建对话" onClick={onNewChat} aria-label="新建对话">
        <SquarePenIcon />
      </TooltipIconButton>
      <div className="pointer-events-none flex min-w-0 flex-1 justify-center px-2">
        <span className="truncate text-sm font-medium">{title}</span>
      </div>
      <span className="text-muted-foreground hidden shrink-0 text-xs sm:block">{agentName}</span>
      <TooltipIconButton
        tooltip={panelOpen ? "收起对话摘要" : "展开对话摘要"}
        onClick={onTogglePanel}
        aria-label="切换对话摘要"
        className={panelOpen ? "bg-accent text-foreground" : undefined}
      >
        <PanelRightIcon />
      </TooltipIconButton>
    </header>
  )
}

function AdminHeader({
  nav,
  sidebarOpen,
  onToggleSidebar,
}: {
  nav: Exclude<NavKey, "chat">
  sidebarOpen: boolean
  onToggleSidebar: () => void
}) {
  return (
    <header className="border-border/60 bg-background/80 flex h-14 shrink-0 items-center gap-1 border-b px-3 backdrop-blur">
      {!sidebarOpen && (
        <TooltipIconButton tooltip="展开侧栏" onClick={onToggleSidebar} aria-label="展开侧栏">
          <PanelLeftIcon />
        </TooltipIconButton>
      )}
      <div className="min-w-0 flex-1 px-1">
        <span className="truncate text-sm font-medium">{NAV_TITLES[nav]}</span>
      </div>
    </header>
  )
}

/**
 * 会话标题自动生成：监听线程里第一条用户消息。
 *
 * <p>渲染为空，只做一次本地目录的标题提升；不触碰后端转录。
 */
function SessionTitler({
  threadId,
  onTitle,
}: {
  threadId: string
  onTitle: (threadId: string, text: string) => void
}) {
  const firstUserText = useAuiState((state) => {
    const message = state.thread.messages.find((item) => item.role === "user")
    if (!message) return null
    const text = message.parts
      .flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join("")
      .trim()
    return text.length > 0 ? text : null
  })

  useEffect(() => {
    if (firstUserText) onTitle(threadId, firstUserText)
  }, [firstUserText, threadId, onTitle])

  return null
}

function Welcome({ agentId }: { agentId: string }) {
  const agent = agentById(agentId)
  return (
    <div className="aui-thread-welcome-root fade-in slide-in-from-bottom-1 animate-in fill-mode-both mb-8 flex flex-col items-center px-4 text-center duration-200">
      <h1 className="text-foreground text-3xl font-semibold tracking-tight text-balance">
        {agent.name}
      </h1>
      <p className="text-muted-foreground mt-2.5 max-w-md text-[15px] leading-relaxed text-pretty">
        {agent.description}。目标即服务，context is all you need。
      </p>
    </div>
  )
}
