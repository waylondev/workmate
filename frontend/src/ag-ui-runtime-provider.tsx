import { HttpAgent } from "@ag-ui/client"
import {
  AssistantRuntimeProvider,
  type RespondToToolApprovalOptions,
} from "@assistant-ui/react"
import { useAgUiRuntime } from "@assistant-ui/react-ag-ui"
import { createContext, useContext, useMemo, type ReactNode } from "react"
import { aguiSseFetch } from "@/agui-sse"

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
        {children}
      </ApprovalRuntimeContext.Provider>
    </AssistantRuntimeProvider>
  )
}
