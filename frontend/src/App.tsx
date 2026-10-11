import { AgUiRuntimeProvider } from "@/ag-ui-runtime-provider"
import { AGENTS } from "@/agents"
import { deleteSession as deleteSessionRemote } from "@/api"
import { AdminPanel } from "@/AdminPanel"
import { ThemeToggle } from "@/components/theme-toggle"
import { Thread } from "@/components/thread.aui"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import {
  PlusIcon,
  SparklesIcon,
  MessageSquareIcon,
  Trash2Icon,
  BotIcon,
  WrenchIcon,
  ClockIcon,
} from "lucide-react"
import { useEffect, useMemo, useState, type ReactNode } from "react"

type ChatSession = {
  threadId: string
  agentId: string
  title: string
  updatedAt: number
}

type NavKey = "chat" | "agents" | "skills" | "jobs"

const SESSIONS_KEY = "workmate-sessions"

function loadSessions(): ChatSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function persistSessions(sessions: ChatSession[]) {
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions))
  } catch {
    // ignore quota / privacy-mode errors
  }
}

function newThreadId() {
  return crypto.randomUUID()
}

export default function App() {
  const [agentId, setAgentId] = useState(AGENTS[0].id)
  const [nav, setNav] = useState<NavKey>("chat")
  const [sessions, setSessions] = useState<ChatSession[]>(() => loadSessions())
  const [threadId, setThreadId] = useState<string>(() => {
    const existing = loadSessions()
    return existing.length > 0 ? existing[0].threadId : newThreadId()
  })

  // 当前会话列表持久化到 localStorage
  useEffect(() => {
    persistSessions(sessions)
  }, [sessions])

  const currentSession = useMemo(
    () => sessions.find((s) => s.threadId === threadId),
    [sessions, threadId],
  )

  const activeAgentId = currentSession?.agentId ?? agentId

  const createSession = () => {
    const id = newThreadId()
    const session: ChatSession = {
      threadId: id,
      agentId: agentId,
      title: "新会话",
      updatedAt: Date.now(),
    }
    setSessions((prev) => [session, ...prev])
    setThreadId(id)
    setNav("chat")
  }

  const switchSession = (id: string) => {
    const session = sessions.find((s) => s.threadId === id)
    if (session) {
      setThreadId(id)
      setAgentId(session.agentId)
      setNav("chat")
    }
  }

  const deleteSession = (id: string) => {
    // 后端删除（复用官方 ThreadSessionManager，fire-and-forget）
    void deleteSessionRemote(id).catch(() => {
      // 后端删除失败不阻塞本地清理
    })
    setSessions((prev) => {
      const next = prev.filter((s) => s.threadId !== id)
      if (id === threadId) {
        if (next.length > 0) {
          setThreadId(next[0].threadId)
          setAgentId(next[0].agentId)
        } else {
          setThreadId(newThreadId())
        }
      }
      return next
    })
  }

  const handleAgentChange = (id: string) => {
    setAgentId(id)
    setSessions((prev) =>
      prev.map((s) => (s.threadId === threadId ? { ...s, agentId: id } : s)),
    )
  }

  return (
    <TooltipProvider>
      <div className="flex h-dvh bg-background">
        {/* 最左窄图标导航栏 */}
        <NavRail nav={nav} onNav={setNav} onNewChat={createSession} />

        {/* 会话列表侧栏（仅聊天视图显示） */}
        {nav === "chat" && (
          <SessionSidebar
            sessions={sessions}
            currentThreadId={threadId}
            onNew={createSession}
            onSwitch={switchSession}
            onDelete={deleteSession}
          />
        )}

        {/* 主内容区 */}
        {nav === "chat" ? (
          <AgUiRuntimeProvider key={threadId} agentId={activeAgentId} threadId={threadId}>
            <div className="flex h-dvh min-w-0 flex-1 flex-col">
              <Header agentId={activeAgentId} onAgentChange={handleAgentChange} />
              <div className="min-h-0 flex-1">
                <Thread components={{ Welcome: () => <Welcome agentId={activeAgentId} /> }} />
              </div>
            </div>
          </AgUiRuntimeProvider>
        ) : (
          <div className="flex h-dvh min-w-0 flex-1 flex-col">
            <Header agentId={activeAgentId} onAgentChange={handleAgentChange} />
            <div className="min-h-0 flex-1">
              <AdminPanel initialTab={nav} />
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}

function NavRail({
  nav,
  onNav,
  onNewChat,
}: {
  nav: NavKey
  onNav: (key: NavKey) => void
  onNewChat: () => void
}) {
  const items: { key: NavKey; label: string; icon: ReactNode }[] = [
    { key: "chat", label: "会话", icon: <MessageSquareIcon className="size-5" /> },
    { key: "agents", label: "Agent", icon: <BotIcon className="size-5" /> },
    { key: "skills", label: "Skill", icon: <WrenchIcon className="size-5" /> },
    { key: "jobs", label: "定时任务", icon: <ClockIcon className="size-5" /> },
  ]

  return (
    <nav className="border-border/60 bg-muted/30 flex w-14 shrink-0 flex-col items-center border-r py-3">
      <div className="bg-foreground text-background mb-4 flex size-9 items-center justify-center rounded-lg">
        <SparklesIcon className="size-5" />
      </div>

      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onNav(item.key)}
          title={item.label}
          aria-label={item.label}
          className={cn(
            "mb-1 flex size-10 items-center justify-center rounded-lg transition-colors",
            nav === item.key
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
          )}
        >
          {item.icon}
        </button>
      ))}

      <div className="mt-auto flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={onNewChat}
          title="新建会话"
          aria-label="新建会话"
          className="text-muted-foreground hover:text-foreground flex size-10 items-center justify-center rounded-lg transition-colors"
        >
          <PlusIcon className="size-5" />
        </button>
        <ThemeToggle />
      </div>
    </nav>
  )
}

function SessionSidebar({
  sessions,
  currentThreadId,
  onNew,
  onSwitch,
  onDelete,
}: {
  sessions: ChatSession[]
  currentThreadId: string
  onNew: () => void
  onSwitch: (id: string) => void
  onDelete: (id: string) => void
}) {
  return (
    <aside className="border-border/60 bg-muted/20 flex w-64 shrink-0 flex-col border-r">
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-3">
        <span className="text-sm font-medium">会话</span>
        <button
          type="button"
          onClick={onNew}
          className="bg-foreground text-background flex size-7 items-center justify-center rounded-lg transition-colors hover:opacity-80"
          aria-label="新建会话"
          title="新建会话"
        >
          <PlusIcon className="size-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {sessions.length === 0 ? (
          <p className="text-muted-foreground px-2 py-4 text-xs">暂无会话，点击上方 + 新建</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {sessions.map((session) => (
              <li key={session.threadId}>
                <div
                  className={cn(
                    "group flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors",
                    session.threadId === currentThreadId
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSwitch(session.threadId)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-start"
                  >
                    <MessageSquareIcon className="size-3.5 shrink-0" />
                    <span className="truncate">{session.title}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(session.threadId)}
                    className="text-muted-foreground hover:text-destructive opacity-0 transition-opacity group-hover:opacity-100"
                    aria-label="删除会话"
                    title="删除会话"
                  >
                    <Trash2Icon className="size-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}

function Header({
  agentId,
  onAgentChange,
}: {
  agentId: string
  onAgentChange: (id: string) => void
}) {
  return (
    <header className="border-border/60 bg-background/80 shrink-0 border-b backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-3 px-4">
        <AgentSwitcher agentId={agentId} onAgentChange={onAgentChange} />
      </div>
    </header>
  )
}

function AgentSwitcher({
  agentId,
  onAgentChange,
}: {
  agentId: string
  onAgentChange: (id: string) => void
}) {
  return (
    <div
      role="tablist"
      aria-label="选择 Agent"
      className="bg-muted flex shrink-0 items-center gap-0.5 rounded-lg p-0.5"
    >
      {AGENTS.map((agent) => (
        <button
          key={agent.id}
          type="button"
          role="tab"
          aria-selected={agent.id === agentId}
          title={agent.description}
          onClick={() => onAgentChange(agent.id)}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors outline-none",
            "focus-visible:ring-ring/50 focus-visible:ring-1",
            agent.id === agentId
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {agent.name}
        </button>
      ))}
    </div>
  )
}

function Welcome({ agentId }: { agentId: string }) {
  const agent = AGENTS.find((a) => a.id === agentId) ?? AGENTS[0]
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
