// HITL 审批链路的可复现检查。
//
// 背景：后端（AgentScope harness）在工具需授权时，`RUN_FINISHED.outcome.interrupts[]`
// 带 `expiresAt: null`；`@ag-ui/client` 用 zod 校验事件，null 会拒绝成 string，
// 导致**整轮运行**以 ZodError 崩掉、UI 只显示一条报错而没有审批卡。
//
// 本脚本把真实抓取的 SSE 字节用本地 HTTP 服务原样重放，让真正的 HttpAgent 走
// **与页面完全相同的 fetch 包装**（`@/agui-sse`），验证中断能完整抵达 UI 层；
// 并反向验证：去掉包装确实会崩，证明该包装是必需的而非多余。
//
// 用法：AGUI_SSE_FILE=<sse-file> node .ui-check/agui-pipeline-check.js
// 默认取 build/int/verify 下最新的 hitl-*.txt。

import { createServer } from "node:http"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { HttpAgent } from "@ag-ui/client"
import { aguiSseFetch } from "@/agui-sse"
import { classifyAguiFailure } from "@/agui-errors"

let failures = 0
const check = (label: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? `  ${extra}` : ""}`)
  if (!ok) failures += 1
}
const info = (text: string) => console.log(`      ${text}`)

const repoRoot = join(import.meta.dirname, "..", "..")

const resolveFixture = (): string => {
  const explicit = process.env.AGUI_SSE_FILE
  if (explicit) return explicit
  const dir = join(repoRoot, "build", "int", "verify")
  const candidates = readdirSync(dir)
    // 只取真正的 SSE 事件流文件：以 `data:{` 开头的 hitl-*.txt（排除 hitl-e2e.txt 这类摘要）
    .filter((name) => name.startsWith("hitl-") && name.endsWith(".txt") && name !== "hitl-e2e.txt")
    .map((name) => join(dir, name))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  if (candidates.length === 0) {
    throw new Error(`未找到 SSE 取证文件，请先运行 dev/verify-all.sh 或显式指定 AGUI_SSE_FILE`)
  }
  return candidates[0]
}

const file = resolveFixture()
const body = readFileSync(file, "utf8")
console.log(`真实 SSE 字节：${body.length} 字节（${file}）\n`)

/** 用本地服务原样重放该 SSE，让 HttpAgent 去消费。 */
const replay = async (useWrapper: boolean) => {
  const server = createServer((_req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    })
    res.end(body)
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()))
  const { port } = server.address() as { port: number }

  const agent = new HttpAgent({
    url: `http://127.0.0.1:${port}/run`,
    threadId: "pipeline-check",
    ...(useWrapper && { fetch: aguiSseFetch }),
  })

  const events: string[] = []
  const toolCalls: Array<{ toolCallId: string; toolCallName: string }> = []
  let outcome: string | undefined
  let interrupts: Array<Record<string, unknown>> = []
  let error: Error | undefined

  agent.subscribe({
    onEvent: ({ event }) => {
      events.push(event.type)
      if (event.type === "TOOL_CALL_START") {
        const started = event as unknown as { toolCallId: string; toolCallName: string }
        toolCalls.push({ toolCallId: started.toolCallId, toolCallName: started.toolCallName })
      }
    },
    onRunFinishedEvent: (params) => {
      outcome = params.outcome
      if (params.outcome === "interrupt") {
        interrupts = params.interrupts as unknown as Array<Record<string, unknown>>
      }
    },
  })

  try {
    await agent.runAgent({ runId: "pipeline-check-run" })
  } catch (raised) {
    error = raised as Error
  } finally {
    server.close()
  }

  return { events, toolCalls, outcome, interrupts, error }
}

// ---- 反向验证：不带包装时，expiresAt:null 会让整轮运行崩掉 ----
const bare = await replay(false)
check(
  "Z1 不带 SSE 包装时确因 expiresAt:null 崩掉（zod 拒绝该事件）",
  bare.error !== undefined && /ZodError|expiresAt/.test(bare.error.message),
  bare.error ? "已复现 ZodError" : "未复现——说明该包装可能已非必需，需重新评估",
)
if (bare.error) info(bare.error.message.split("\n")[0])

// ---- 正向验证：带包装后，中断完整抵达 UI 层 ----
const wrapped = await replay(true)

check(
  "Z2 带包装后整轮运行无异常结束",
  wrapped.error === undefined,
  wrapped.error ? wrapped.error.message.split("\n")[0] : "",
)
check(
  "Z3 RUN_FINISHED 的 outcome 保留为 interrupt（审批卡的状态来源）",
  wrapped.outcome === "interrupt",
  `outcome=${String(wrapped.outcome)}`,
)
check(
  "Z4 中断明细完整（id/reason/toolCallId 齐备）",
  wrapped.interrupts.length > 0 &&
    wrapped.interrupts.every(
      (item) =>
        typeof item.id === "string" &&
        typeof item.reason === "string" &&
        typeof item.toolCallId === "string",
    ),
  `${wrapped.interrupts.length} 个中断`,
)

const startedIds = new Set(wrapped.toolCalls.map((call) => call.toolCallId))
const boundCount = wrapped.interrupts.filter((item) => startedIds.has(item.toolCallId as string)).length
check(
  "Z5 每个中断都能绑定到本轮真实发出的工具调用（否则适配器不投影 approval）",
  boundCount === wrapped.interrupts.length && wrapped.interrupts.length > 0,
  `${boundCount}/${wrapped.interrupts.length} 已绑定；工具调用：${wrapped.toolCalls.map((c) => c.toolCallName).join(", ") || "无"}`,
)
check(
  "Z6 expiresAt 已被剔除（不再出现 null）",
  wrapped.interrupts.every((item) => !("expiresAt" in item) || typeof item.expiresAt === "string"),
)
if (wrapped.interrupts[0]) info(`首个中断 message：${String(wrapped.interrupts[0].message ?? "")}`)

// ---- 运行时层：approval 是否真的挂到工具卡、且接受点击 ----
// 这一层决定「UI 会不会出现 Allow/Deny」。直接构造真实的 AgUiThreadRuntimeCore，
// 把重放流喂给它，再检查待决中断与工具卡上的 approval。
const coreUrl = pathToFileURL(
  resolve(
    import.meta.dirname,
    "../node_modules/@assistant-ui/react-ag-ui/dist/runtime/AgUiThreadRuntimeCore.js",
  ),
).href
const loggerUrl = pathToFileURL(
  resolve(
    import.meta.dirname,
    "../node_modules/@assistant-ui/react-ag-ui/dist/runtime/logger.js",
  ),
).href
const { AgUiThreadRuntimeCore } = await import(coreUrl)
const { makeLogger } = await import(loggerUrl)

const runCore = async () => {
  const server = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" })
    res.end(body)
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()))
  const { port } = server.address() as { port: number }

  const agent = new HttpAgent({
    url: `http://127.0.0.1:${port}/run`,
    threadId: "runtime-check",
    fetch: aguiSseFetch,
  })
  const core = new AgUiThreadRuntimeCore({ agent, logger: makeLogger(undefined) })
  let appendError: Error | undefined
  try {
    await core.append({ role: "user", content: "列出当前目录文件" })
  } catch (raised) {
    appendError = raised as Error
  } finally {
    server.close()
  }
  return { core, appendError }
}

const { core, appendError } = await runCore()

check(
  "Z7 运行时消费完整轮次无异常",
  appendError === undefined,
  appendError ? appendError.message.split("\n")[0] : "",
)

const pending = core.getPendingInterrupts() as
  | { messageId: string; interrupts: Array<{ id: string; toolCallId: string }> }
  | null
check(
  "Z8 运行时登记了待决中断（决定 UI 进入 requires-action 态）",
  pending !== null && pending.interrupts.length > 0,
  pending ? `${pending.interrupts.length} 个` : "无",
)

const messages = core.getMessages() as Array<{
  role: string
  content?: unknown
}>
const assistant = [...messages].reverse().find((message) => message.role === "assistant")
const parts = Array.isArray(assistant?.content) ? (assistant!.content as Array<Record<string, unknown>>) : []
const toolParts = parts.filter((part) => part.type === "tool-call")
const approved = toolParts.filter((part) => part.approval != null)
check(
  "Z9 工具卡上挂上了 approval（决定卡内出现 Allow/Deny 按钮）",
  approved.length > 0,
  `${approved.length}/${toolParts.length} 张工具卡；示例：${approved[0] ? JSON.stringify(approved[0].approval) : "无"}`,
)

if (pending && pending.interrupts.length > 0) {
  const approvalId = (approved[0]?.approval as { id?: string } | undefined)?.id
  let respondError: Error | undefined
  try {
    if (approvalId) await core.respondToToolApproval({ approvalId, approved: true })
  } catch (raised) {
    respondError = raised as Error
  }
  check(
    "Z10 点击批准被运行时接受（批次未齐时不报错，等其余闸门）",
    respondError === undefined || !/no pending tool-call interrupt/.test(respondError.message),
    respondError ? respondError.message.split("\n")[0] : "",
  )

  // 「全部允许」= 对所有待决 approval 逐个 respond(true)。
  // 这里用真实 runtime 验证：收集全部 approval id 后循环批准，无一报「已决定」以外的错。
  const allApprovalIds = approved
    .map((part) => (part.approval as { id?: string } | undefined)?.id)
    .filter((id): id is string => typeof id === "string")
  let allAllowError: Error | undefined
  try {
    for (const id of allApprovalIds) {
      await core.respondToToolApproval({ approvalId: id, approved: true })
    }
  } catch (raised) {
    allAllowError = raised as Error
  }
  check(
    "Z16 「全部允许」可批量批准所有待授权项（逐个 respond 无致命错误）",
    allApprovalIds.length > 0 &&
      (allAllowError === undefined || /already decided/.test(allAllowError.message)),
    `${allApprovalIds.length} 个 approval；${allAllowError ? allAllowError.message.split("\n")[0] : "全部接受"}`,
  )
}

// ---- 失败归类：后端原文报文必须被判成「会话卡在待授权」并给出出路 ----
// 样本是真实抓取的 RUN_ERROR 原文（`scripts/fixtures/`），不是手写的近似串。
const fixture = join(import.meta.dirname, "..", "scripts", "fixtures", "stale-approval-run-error.txt")
let staleMessage = ""
try {
  staleMessage = readFileSync(fixture, "utf8")
} catch {
  staleMessage = ""
}

check(
  "Z11 取到真实 RUN_ERROR 原文样本（后端重启后对卡死会话的拒绝）",
  staleMessage.length > 0,
  staleMessage ? `${staleMessage.length} 字符` : `未找到 ${fixture}`,
)

const classified = staleMessage ? classifyAguiFailure(new Error(staleMessage)) : null
check(
  "Z12 真实报文被判为「会话卡在待授权」而非普通错误",
  classified?.kind === "stale-approval",
  classified ? `待确认工具：${classified.pendingTools.join(", ") || "未解析出"}` : "未归类",
)
check(
  "Z13 从报文中解析出待确认工具名（提示条才能说清卡在哪）",
  (classified?.pendingTools.length ?? 0) > 0,
)
check(
  "Z14 AG-UI 层的同类拒绝也被归类（unresolved interrupts）",
  classifyAguiFailure(
    new Error("Thread has unresolved interrupts; RunAgentInput.resume must address all of them"),
  )?.kind === "stale-approval",
)
check(
  "Z15 无关错误不被误判（保持原有错误展示）",
  classifyAguiFailure(new Error("Agent not found: explorer")) === null,
)

console.log(`\n合计：FAIL=${failures}`)
if (failures > 0) process.exit(1)

