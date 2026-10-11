import { AgUiRuntimeProvider } from "@/ag-ui-runtime-provider"
import { ThemeToggle } from "@/components/theme-toggle"
import { Thread } from "@/components/thread.aui"
import { TooltipProvider } from "@/components/ui/tooltip"
import { SparklesIcon } from "lucide-react"

export default function App() {
  return (
    <TooltipProvider>
      <AgUiRuntimeProvider>
        <div className="flex h-dvh flex-col bg-background">
          <Header />
          <div className="min-h-0 flex-1">
            <Thread />
          </div>
        </div>
      </AgUiRuntimeProvider>
    </TooltipProvider>
  )
}

function Header() {
  return (
    <header className="border-border/60 bg-background/80 shrink-0 border-b backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
        <div className="flex items-center gap-2.5">
          <span className="bg-foreground text-background flex size-7 items-center justify-center rounded-lg">
            <SparklesIcon className="size-4" />
          </span>
          <span className="text-[15px] leading-tight font-semibold tracking-tight">
            Workmate
          </span>
        </div>
        <ThemeToggle />
      </div>
    </header>
  )
}