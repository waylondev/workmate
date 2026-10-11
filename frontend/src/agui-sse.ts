import type { HttpAgentFetchFn } from "@ag-ui/client"

/**
 * AG-UI SSE 的 HTTP 层适配。
 *
 * <p>AgentScope harness 在工具需授权时，`RUN_FINISHED.outcome.interrupts[]` 会带
 * `expiresAt: null`。而 `@ag-ui/client` 用 zod 校验每个事件，其 interrupt schema
 * 要求 `expiresAt` 为 string，收到 null 会让**整轮运行**以 ZodError 崩掉
 * （`Agent execution failed: ZodError ... path: ["outcome","interrupts",0,"expiresAt"]`），
 * 前端只能显示一条报错，审批卡根本没有机会渲染。
 *
 * <p>因此在这里于事件进入 zod 之前把值为 null 的 `expiresAt` 移除：该字段本就可选，
 * 缺失即通过校验；合法的字符串时间戳原样保留。这是协议层的不兼容修补，与业务无关。
 *
 * <p>本模块刻意不依赖 React / assistant-ui，便于被 `scripts/agui-pipeline-check.ts`
 * 用真实 SSE 字节直接验证（见该脚本）。
 */
export function stripNullExpiresAt(value: unknown): void {
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

/** 逐行改写 SSE：`data:` 行解析成 JSON、剔除 null 的 expiresAt、再写回。 */
export const rewriteSseDataLine = (line: string): string => {
  if (!line.startsWith("data:")) return line
  try {
    const parsed = JSON.parse(line.slice(5).trim())
    stripNullExpiresAt(parsed)
    return "data:" + JSON.stringify(parsed)
  } catch {
    return line // 非 JSON 行（心跳、注释）原样透传
  }
}

/** 自定义 fetch：把 AG-UI SSE 流里 `expiresAt: null` 剔除后再交给运行时解析。 */
export const aguiSseFetch: HttpAgentFetchFn = async (url, init) => {
  const response = await fetch(url, init)
  if (!response.body) return response

  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  const reader = response.body.getReader()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let buffer = ""
      const flushLine = (line: string) => {
        controller.enqueue(encoder.encode(rewriteSseDataLine(line) + "\n"))
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

  return new Response(stream, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
}
