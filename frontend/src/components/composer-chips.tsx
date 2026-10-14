import { agentById, permissionLabel, permissionTone } from "@/agents"
import { useChatChrome } from "@/chat-chrome"
import { cn } from "@/lib/utils"
import {
  CheckIcon,
  ChevronDownIcon,
  FolderIcon,
  WrenchIcon,
  ZapIcon,
} from "lucide-react"
import { useEffect, useRef, useState, type ReactNode } from "react"

/**
 * 输入区底部能力条：附件入口（由官方 `ComposerAddAttachment` 提供）右侧的
 * agent（含权限徽章）/ 技能 / 工具 chip。
 *
 * <p>chip 只暴露**真实存在**的能力：agent 切换与权限徽章来自 `workmate.agents`
 * 配置（后端官方 `PermissionMode.getValue()`），技能与工作进度直接定位到右栏对应段落。
 * 不在聊天外壳内时整条不渲染，官方 Thread 仍可独立使用。
 */
export function ComposerChips() {
  const chrome = useChatChrome()
  if (!chrome) return null

  return (
    <div className="aui-composer-chips flex min-w-0 items-center gap-1.5">
      <AgentChip agentId={chrome.agentId} onSelect={chrome.onAgentChange} />
      <Chip
        icon={<WrenchIcon className="size-3" />}
        label="技能"
        title="查看本 agent 可发现的技能"
        onClick={() => chrome.revealPanel("skills")}
      />
      <Chip
        icon={<ZapIcon className="size-3" />}
        label="工作进度"
        title="查看本次对话的工作进度"
        onClick={() => chrome.revealPanel("progress")}
      />
    </div>
  )
}

function Chip({
  icon,
  label,
  title,
  onClick,
}: {
  icon: ReactNode
  label: string
  title: string
  onClick?: (() => void) | undefined
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "border-border/70 text-muted-foreground flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[11px] transition-colors",
        onClick ? "hover:bg-accent hover:text-foreground" : "cursor-default",
      )}
    >
      {icon}
      <span className="max-w-20 truncate">{label}</span>
    </button>
  )
}

function AgentChip({ agentId, onSelect }: { agentId: string; onSelect: (agentId: string) => void }) {
  const chrome = useChatChrome()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const agent = chrome ? agentById(chrome.agents, agentId) : undefined
  const agents = chrome?.agents ?? []

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`切换 agent（决定 /agui/run/{id}）`}
        className="border-border/70 text-muted-foreground hover:bg-accent hover:text-foreground flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] transition-colors"
      >
        <FolderIcon className="size-3" />
        <span className="max-w-20 truncate">{agent?.name ?? ""}</span>
        {agent && (
          <span
            className={cn(
              "rounded-full border px-1.5 py-px text-[10px] leading-4",
              permissionTone(agent.permission),
            )}
          >
            {permissionLabel(agent.permission)}
          </span>
        )}
        <ChevronDownIcon className="size-3" />
      </button>

      {open && (
        <div
          role="menu"
          className="glass bg-popover/90 text-popover-foreground absolute bottom-full left-0 z-50 mb-1.5 w-60 rounded-xl border p-1 shadow-xl"
        >
          {agents.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitemradio"
              aria-checked={item.id === agentId}
              onClick={() => {
                onSelect(item.id)
                setOpen(false)
              }}
              className="hover:bg-accent focus:bg-accent flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-start outline-none"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-medium">{item.name}</p>
                  <span
                    className={cn(
                      "rounded-full border px-1.5 py-px text-[10px] leading-4",
                      permissionTone(item.permission),
                    )}
                  >
                    {permissionLabel(item.permission)}
                  </span>
                </div>
                <p className="text-muted-foreground text-[11px] leading-4">{item.description}</p>
              </div>
              {item.id === agentId && <CheckIcon className="mt-0.5 size-3.5 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
