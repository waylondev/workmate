import { HttpAgent, type HttpAgentFetchFn } from "@ag-ui/client"
import { AssistantRuntimeProvider } from "@assistant-ui/react"
import { useAgUiRuntime } from "@assistant-ui/react-ag-ui"
import { useMemo, type ReactNode } from "react"

/**
 * 递归清理 AG-UI 事件里的 `expiresAt: null`。
 *
 * <p>后端（AgentScope harness）在工具需授权时返回 RUN_FINISHED 的
 * `outcome.interrupts[].expiresAt = null`，而 assistant-ui 的 interrupt
 * schema 期望该可选字段为 string；收到 null 会抛
 * `invalid_type: expected string, received null`，导致前端无法继续渲染
 * 工具授权卡片。这里在 HTTP 层把值为 null 的 expiresAt 字段移除（可选字段
 * 缺失即通过校验），保留合法的字符串时间戳。
 */
function stripNullExpiresAt(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) stripNullExpiresAt(item)
    return
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    for (const key of Object.keys(record)) {
      if (key === "expiresAt" && record[key] == null) {
        delete record[key]
      } else {
        stripNullExpiresAt(record[key])
      }
    }
  }
}

/** 自定义 fetch：把 AG-UI SSE 流里 `expiresAt:null` 剔除后再交给运行时解析。 */
const aguiSseFetch: HttpAgentFetchFn = async (url, init) => {
  const response = await fetch(url, init)
  if (!response.body) return response
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  const reader = response.body.getReader()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let buffer = ""
      const flushLine = (line: string) => {
        let out = line
        if (line.startsWith("data:")) {
          const payload = line.slice(5).trim()
          try {
            const parsed = JSON.parse(payload)
            stripNullExpiresAt(parsed)
            out = "data:" + JSON.stringify(parsed)
          } catch {
            /* 非 JSON 行原样透传 */
          }
        }
        controller.enqueue(encoder.encode(out + "\n"))
      }
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""
        for (const line of lines) flushLine(line)
      }
      if (buffer) flushLine(buffer)
      controller.close()
    },
  })
  return new Response(stream, { status: response.status, headers: response.headers })
}

/**
 * 把 AG-UI 后端接成 assistant-ui 运行时。
 *
 * <p>事件解析（TEXT_MESSAGE_* / TOOL_CALL_* / RUN_* 等）全部由适配器完成，
 * 页面侧只需渲染官方 Thread 组件，无需自行处理 SSE 与状态机。
 *
 * <p>调用方用 `key={threadId}` 重新挂载本组件即可切换会话：切换会重建 HttpAgent、
 * 运行时与线程。`threadId` 即后端 AG-UI 的会话隔离键（官方按 (agentId, threadId)
 * 持久化会话历史到 SessionTree JSONL 文件），因此只要 threadId 稳定，刷新/切回
 * 同一会话即可恢复历史。同源相对路径在开发期由 Vite 代理到后端。
 */
export function AgUiRuntimeProvider({
  agentId,
  threadId,
  children,
}: {
  agentId: string
  threadId: string
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

  const runtime = useAgUiRuntime({ agent })

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  )
}
