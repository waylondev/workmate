import type { AgentInfo } from "@/agents"
import { ThemeToggle } from "@/components/theme-toggle"
import { TooltipIconButton } from "@/components/tooltip-icon-button"
import { cn } from "@/lib/utils"
import type { NavKey } from "@/nav"
import type { ChatSession } from "@/sessions"
import {
  BotIcon,
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  FolderIcon,
  PanelLeftCloseIcon,
  SparklesIcon,
  SquarePenIcon,
  Trash2Icon,
  WrenchIcon,
} from "lucide-react"
import type { ReactNode } from "react"

/**
 * 左侧栏：品牌 → 功能导航 → 工作区（agent）→ 最近（会话）→ 用户区。
 *
 * <p>「工作区」段列的是后端 `workmate.agents` 声明的 agent；点击即切换当前会话使用的
 * agent（决定 `/agui/run/{id}`），与中栏输入区的 agent chip 是同一状态。
 */
export function AppSidebar({
  nav,
  onNav,
  agents,
  sessions,
  currentThreadId,
  agentId,
  onNewChat,
  onSwitchSession,
  onDeleteSession,
  onAgentChange,
  onCollapse,
}: {
  nav: NavKey
  onNav: (key: NavKey) => void
  agents: AgentInfo[]
  sessions: ChatSession[]
  currentThreadId: string
  agentId: string
  onNewChat: () => void
  onSwitchSession: (threadId: string) => void
  onDeleteSession: (threadId: string) => void
  onAgentChange: (agentId: string) => void
  onCollapse: () => void
}) {
  const adminNav: { key: "jobs" | "skills" | "agents"; label: string; icon: ReactNode }[] = [
    { key: "jobs", label: "定时任务", icon: <ClockIcon className="size-4" /> },
    { key: "skills", label: "技能", icon: <WrenchIcon className="size-4" /> },
    { key: "agents", label: "Agent 管理", icon: <BotIcon className="size-4" /> },
  ]

  return (
    <aside className="glass border-border/60 relative z-10 hidden w-64 shrink-0 flex-col border-r lg:flex">
      <div className="flex items-center gap-2 px-3 py-3">
        <div className="text-primary-foreground btn-brand flex size-7 items-center justify-center rounded-lg shadow-glow-sm">
          <SparklesIcon className="size-4" />
        </div>
        <span className="text-gradient text-sm font-semibold tracking-tight">Workmate</span>
        <TooltipIconButton
          tooltip="收起侧栏"
          onClick={onCollapse}
          className="ms-auto size-7"
          aria-label="收起侧栏"
        >
          <PanelLeftCloseIcon />
        </TooltipIconButton>
      </div>

      <nav className="flex flex-col gap-0.5 px-2">
        <SidebarRow
          icon={<SquarePenIcon className="size-4" />}
          label="新建对话"
          onClick={onNewChat}
        />
        {adminNav.map((item) => (
          <SidebarRow
            key={item.key}
            icon={item.icon}
            label={item.label}
            active={nav === item.key}
            onClick={() => onNav(item.key)}
          />
        ))}
      </nav>

      <div className="mt-2 min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        <SidebarSectionLabel>工作区</SidebarSectionLabel>
        <ul className="flex flex-col gap-0.5">
          {agents.map((agent) => {
            const active = nav === "chat" && agent.id === agentId
            return (
              <li key={agent.id}>
                <SidebarRow
                  icon={<FolderIcon className="size-4" />}
                  label={agent.name}
                  title={agent.description}
                  active={active}
                  onClick={() => onAgentChange(agent.id)}
                  trailing={
                    active ? <CheckIcon className="text-muted-foreground size-3.5" /> : undefined
                  }
                />
              </li>
            )
          })}
        </ul>

        <SidebarSectionLabel>最近</SidebarSectionLabel>
        {sessions.length === 0 ? (
          <p className="text-muted-foreground px-2 py-1.5 text-xs">暂无会话</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {sessions.map((session) => (
              <li key={session.threadId}>
                <SessionRow
                  session={session}
                  active={nav === "chat" && session.threadId === currentThreadId}
                  onSwitch={onSwitchSession}
                  onDelete={onDeleteSession}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-border/60 flex items-center gap-2 border-t px-3 py-2.5">
        <div className="bg-foreground/90 text-background flex size-7 items-center justify-center rounded-full text-xs font-medium">
          本
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium">本地用户</p>
          <p className="text-muted-foreground truncate text-[11px]">标准套餐</p>
        </div>
        <ThemeToggle />
      </div>
    </aside>
  )
}

function SidebarSectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-muted-foreground/80 flex items-center gap-1 px-2 pt-4 pb-1 text-[11px] font-medium">
      {children}
      <ChevronRightIcon className="size-3" />
    </p>
  )
}

function SidebarRow({
  icon,
  label,
  active = false,
  title,
  trailing,
  onClick,
}: {
  icon: ReactNode
  label: string
  active?: boolean
  title?: string | undefined
  trailing?: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-start text-[13px] transition-colors",
        active
          ? "bg-primary/10 text-foreground shadow-inset-primary"
          : "text-muted-foreground hover:bg-background/70 hover:text-foreground",
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing}
    </button>
  )
}

function SessionRow({
  session,
  active,
  onSwitch,
  onDelete,
}: {
  session: ChatSession
  active: boolean
  onSwitch: (threadId: string) => void
  onDelete: (threadId: string) => void
}) {
  return (
    <div
      className={cn(
        "group flex items-center gap-1 rounded-lg transition-colors",
        active
          ? "bg-primary/10 text-foreground shadow-inset-primary"
          : "text-muted-foreground hover:bg-background/70 hover:text-foreground",
      )}
    >
      <button
        type="button"
        onClick={() => onSwitch(session.threadId)}
        className="min-w-0 flex-1 truncate px-2 py-1.5 text-start text-[13px]"
        title={session.title}
      >
        {session.title}
      </button>
      <button
        type="button"
        onClick={() => onDelete(session.threadId)}
        className="text-muted-foreground hover:text-destructive me-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        aria-label={`删除会话 ${session.title}`}
        title="删除会话（清空服务端转录，不可恢复）"
      >
        <Trash2Icon className="size-3.5" />
      </button>
    </div>
  )
}
