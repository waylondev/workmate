import { HttpAgent, type AgentSubscriber } from "@ag-ui/client"
import {
  AssistantRuntimeProvider,
  type RespondToToolApprovalOptions,
} from "@assistant-ui/react"
import { useAgUiRuntime } from "@assistant-ui/react-ag-ui"
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { aguiSseFetch } from "@/agui-sse"
import {
  applySubagentEvent,
  type SubagentEventValue,
  type SubagentRun,
} from "@/subagent"

/**
 * 运行时能力上下文：把 AG-UI 适配器注册的工具审批方法暴露给
 * `AssistantRuntimeProvider` 之外的组件（顶部审批横幅等）。
 *
 * <p>官方 `ThreadRuntime` 公共接口没有声明 `respondToToolApproval`，它只挂在
 * `ThreadRuntimeImpl.__internal_threadBinding` 上（由适配器的
 * `onRespondToToolApproval` 回填）。这里做一次精确收窄，拿到正确类型，而不是
 * 依赖 store schema 补丁或另建一套运行时。
 */
type ApprovalRuntime = {
  respondToToolApproval: (options: RespondToToolApprovalOptions) => Promise<void>
}

const ApprovalRuntimeContext = createContext<ApprovalRuntime | null>(null)

/** 在 Provider 内读取审批能力；不在 Provider 内返回 null。 */
export function useApprovalRuntime(): ApprovalRuntime | null {
  return useContext(ApprovalRuntimeContext)
}

/**
 * `ThreadRuntimeImpl.__internal_threadBinding` 的收窄类型。
 *
 * <p>审批方法不在 binding 顶层，而在 `getState()` 返回的 ThreadMethods 里
 * （由 `useExternalStoreRuntime` 按 `onRespondToToolApproval` 是否注册动态装配）。
 */
type ThreadBinding = {
  __internal_threadBinding: {
    getState: () => {
      respondToToolApproval?: ApprovalRuntime["respondToToolApproval"]
    }
  }
}

/**
 * 单次模型调用结束时的 token 用量（后端 `AguiEvent.Custom(name="token_usage")` 的
 * `delta` 字段，字段名与 `ModelCallUsageEventConverter.tokenUsageMap` 一致）。
 */
export type TokenUsageSnapshot = {
  inputTokens?: number
  outputTokens?: number
  cachedTokens?: number
  cacheCreationTokens?: number
  reasoningTokens?: number
  toolUsePromptTokens?: number
  totalTokens?: number
  time?: number
}

/** 会话级累计 token 用量，供右栏「Token 用量」展示。 */
export type TokenUsageSummary = {
  /** 累计输入 token（含缓存命中与工具调用提示）。 */
  input: number
  /** 累计输出 token。 */
  output: number
  /** 累计 reasoning（思考）token。 */
  reasoning: number
  /** 累计总 token。 */
  total: number
  /** 已完成的模型调用次数。 */
  calls: number
}

const TokenUsageContext = createContext<TokenUsageSummary | null>(null)

/** 读取当前会话累计 token 用量；未在 Provider 内或无数据时返回 null。 */
export function useTokenUsage(): TokenUsageSummary | null {
  return useContext(TokenUsageContext)
}

const SubagentContext = createContext<readonly SubagentRun[]>([])

/** 读取当前会话的子智能体运行状态（实时累积自 `subagent.*` CUSTOM 事件）。 */
export function useSubagents(): readonly SubagentRun[] {
  return useContext(SubagentContext)
}

/**
 * 从 `token_usage` CUSTOM 事件的 `cumulative` 字段累计 token 用量。
 *
 * <p>后端每次 `ModelCallEndEvent` 都发一个 `token_usage` CUSTOM 事件，payload 含
 * `delta`（本次调用）与 `cumulative`（会话累计，字段与 delta 相同）。这里取
 * `cumulative` 作为会话级真相，避免自己累加各次 delta 出现浮点/边界偏差。
 *
 * <p>字段映射（后端 `TokenUsageSnapshot` → 展示）：
 * - 输入 = `inputTokens`
 * - 输出 = `outputTokens`
 * - 思考 = `reasoningTokens`
 * - 总计 = `totalTokens`
 */
function toSummary(cumulative: TokenUsageSnapshot, calls: number): TokenUsageSummary {
  return {
    input: cumulative.inputTokens ?? 0,
    output: cumulative.outputTokens ?? 0,
    reasoning: cumulative.reasoningTokens ?? 0,
    total: cumulative.totalTokens ?? 0,
    calls,
  }
}

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

  // 订阅 token_usage CUSTOM 事件：每次模型调用结束，后端都发一个
  // `AguiEvent.Custom(name="token_usage")`，payload 含 delta + cumulative。
  // 取 cumulative 作为会话级累计，随调用次数更新。
  const [tokenUsage, setTokenUsage] = useState<TokenUsageSummary | null>(null)
  const [subagents, setSubagents] = useState<readonly SubagentRun[]>([])
  // 子智能体的 `subagent.thinking` 可达数千条 delta，逐条 setState 会让主线程在
  // 思考流式期间被数千次全量重渲染压垮（实测导致 chromium 主线程长时间阻塞、CDP 超时）。
  // 这里用「可变缓冲 + rAF 合帧」：事件先累积到 ref，每动画帧最多 flush 一次到 state。
  const pendingRef = useRef<readonly SubagentRun[]>([])
  const rafRef = useRef<number | null>(null)
  useEffect(() => {
    const subscriber: AgentSubscriber = {
      onCustomEvent: ({ event }) => {
        if (event.name === "token_usage") {
          const value = event.value as
            | { cumulative?: TokenUsageSnapshot; delta?: TokenUsageSnapshot }
            | undefined
          const cumulative = value?.cumulative ?? value?.delta
          if (!cumulative) return
          setTokenUsage((previous) =>
            toSummary(cumulative, (previous?.calls ?? 0) + 1),
          )
          return
        }
        // 子智能体内部事件：AgentScope 经 `subagent.*` CUSTOM 透出（非标准
        // SUBAGENT_* 事件，适配器不处理），这里单独累积供对话区展示。
        if (event.name.startsWith("subagent.")) {
          pendingRef.current = applySubagentEvent(
            pendingRef.current,
            event.value as SubagentEventValue,
          )
          if (rafRef.current === null) {
            rafRef.current = requestAnimationFrame(() => {
              rafRef.current = null
              setSubagents(pendingRef.current)
            })
          }
        }
      },
    }
    const subscription = agent.subscribe(subscriber)
    return () => {
      subscription.unsubscribe()
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [agent])

  const approvalRuntime = useMemo<ApprovalRuntime>(
    () => ({
      respondToToolApproval: (options) => {
        // 方法在 binding.getState()（即 runtime core 本体）上；必须以
        // `methods.xxx(...)` 形式调用保住 this——摘下来调用会丢失
        // core 实例（内部 `this._store` 变 undefined）。
        const methods = (
          runtime.thread as unknown as ThreadBinding
        ).__internal_threadBinding.getState()
        if (!methods.respondToToolApproval) {
          throw new Error(
            "respondToToolApproval 不可用：审批能力未接入运行时",
          )
        }
        return methods.respondToToolApproval(options)
      },
    }),
    [runtime],
  )

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ApprovalRuntimeContext.Provider value={approvalRuntime}>
        <TokenUsageContext.Provider value={tokenUsage}>
          <SubagentContext.Provider value={subagents}>
            {children}
          </SubagentContext.Provider>
        </TokenUsageContext.Provider>
      </ApprovalRuntimeContext.Provider>
    </AssistantRuntimeProvider>
  )
}
