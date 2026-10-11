import { HttpAgent } from "@ag-ui/client"
import { AssistantRuntimeProvider } from "@assistant-ui/react"
import { useAgUiRuntime } from "@assistant-ui/react-ag-ui"
import { useMemo, type ReactNode } from "react"
import { aguiSseFetch } from "@/agui-sse"

/**
 * 把 AG-UI 后端接成 assistant-ui 运行时。
 *
 * <p>事件解析（TEXT_MESSAGE_* / TOOL_CALL_* / RUN_* 等）全部由适配器完成，
 * 页面侧只需渲染官方 Thread 组件，无需自行处理 SSE 与状态机。
 *
 * <p>`fetch` 走 `@/agui-sse` 的包装：AgentScope 返回的 `expiresAt: null`
 * 会让 `@ag-ui/client` 的 zod 校验崩掉整轮运行，必须在事件进入运行时前剔除。
 *
 * <p>调用方用 `key={threadId}` 重新挂载本组件即可切换会话：切换会重建 HttpAgent、
 * 运行时与线程。`threadId` 即后端 AG-UI 的会话隔离键（官方按 (agentId, threadId)
 * 持久化会话历史到 SessionTree JSONL 文件），因此只要 threadId 稳定，刷新/切回
 * 同一会话即可恢复历史。同源相对路径在开发期由 Vite 代理到后端。
 */
export function AgUiRuntimeProvider({
  agentId,
  threadId,
  onError,
  children,
}: {
  agentId: string
  threadId: string
  /** 运行失败回调：交给外壳归类展示（如「会话卡在待授权」给出新建会话的出路）。 */
  onError?: (error: Error) => void
  children: ReactNode
}) {
  const agent = useMemo(
    () =>
      new HttpAgent({
        url: `/agui/run/${agentId}`,
        threadId,
        headers: { Accept: "text/event-stream" },
        fetch: aguiSseFetch,
      }),
    [agentId, threadId],
  )

  const runtime = useAgUiRuntime({ agent, onError })

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  )
}
