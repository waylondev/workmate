import { HttpAgent } from "@ag-ui/client"
import { AssistantRuntimeProvider } from "@assistant-ui/react"
import { useAgUiRuntime } from "@assistant-ui/react-ag-ui"
import { useMemo, type ReactNode } from "react"

/**
 * 后端 AG-UI 端点。`run/{agentId}` 中的 agentId 对应后端 workmate.agents 的 key。
 * 用同源相对路径，开发期由 Vite 代理转发到 Spring Boot，生产期由网关/Nginx 转发。
 */
const AGUI_URL = "/agui/run/default"

/**
 * 把 AG-UI 后端接成 assistant-ui 运行时。
 *
 * <p>事件解析（TEXT_MESSAGE_* / TOOL_CALL_* / RUN_* 等）全部由适配器完成，
 * 页面侧只需渲染官方 Thread 组件，无需自行处理 SSE 与状态机。
 */
export function AgUiRuntimeProvider({ children }: { children: ReactNode }) {
  const agent = useMemo(
    () =>
      new HttpAgent({
        url: AGUI_URL,
        threadId: crypto.randomUUID(),
        headers: { Accept: "text/event-stream" },
      }),
    [],
  )

  const runtime = useAgUiRuntime({ agent })

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  )
}
