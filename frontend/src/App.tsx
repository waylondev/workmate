import { AgUiRuntimeProvider } from "@/ag-ui-runtime-provider"
import { AGENTS } from "@/agents"
import { ThemeToggle } from "@/components/theme-toggle"
import { Thread } from "@/components/thread.aui"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { SparklesIcon } from "lucide-react"
import { useState } from "react"

export default function App() {
  const [agentId, setAgentId] = useState(AGENTS[0].id)

  return (
    <TooltipProvider>
      <AgUiRuntimeProvider key={agentId} agentId={agentId}>
        <div className="flex h-dvh flex-col bg-background">
          <Header agentId={agentId} onAgentChange={setAgentId} />
          <div className="min-h-0 flex-1">
            <Thread components={{ Welcome: () => <Welcome agentId={agentId} /> }} />
          </div>
        </div>
      </AgUiRuntimeProvider>
    </TooltipProvider>
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
        <div className="flex min-w-0 items-center gap-3">
          <span className="bg-foreground text-background flex size-7 shrink-0 items-center justify-center rounded-lg">
            <SparklesIcon className="size-4" />
          </span>
          <AgentSwitcher agentId={agentId} onAgentChange={onAgentChange} />
        </div>
        <ThemeToggle />
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
