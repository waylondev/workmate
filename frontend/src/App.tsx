import { AgUiRuntimeProvider } from "@/ag-ui-runtime-provider"
import { Thread } from "@/components/thread.aui"
import { TooltipProvider } from "@/components/ui/tooltip"

export default function App() {
  return (
    <TooltipProvider>
      <AgUiRuntimeProvider>
        <div className="h-dvh">
          <Thread />
        </div>
      </AgUiRuntimeProvider>
    </TooltipProvider>
  )
}
