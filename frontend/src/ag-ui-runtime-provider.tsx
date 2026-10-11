import { HttpAgent } from "@ag-ui/client"
import { AssistantRuntimeProvider, type RespondToToolApprovalOptions } from "@assistant-ui/react"
import { useAgUiRuntime } from "@assistant-ui/react-ag-ui"
import { createContext, useContext, useMemo, type ReactNode } from "react"
import { aguiSseFetch } from "@/agui-sse"

/**
 * 运行时能力上下文：把 `useAgUiRuntime` 拿到的 thread 审批方法暴露给
 * `AssistantRuntimeProvider` 之外的组件（顶部审批横幅等）。
 *
 * <p>store 层的 `useAui().thread` 类型（`ThreadMethods`）没有声明 AG-UI 适配器
 * 动态注册的 `respondToToolApproval`，但运行时确实有它；这里显式提取并
 * 透传，既拿到正确类型，也不依赖 store schema 的补丁。
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

  const approvalRuntime = useMemo<ApprovalRuntime>(() => {
    // `runtime.thread` 是 `ThreadRuntime`（API 类型），它把 `respondToToolApproval`
    // 藏在 `__internal_threadBinding` 里（由 AG-UI 适配器的 `onRespondToToolApproval`
    // 回填）。这里做一次精确收窄，避免依赖 store schema 补丁。
    const binding = (runtime.thread as unknown as {
      __internal_threadBinding?: {
        respondToToolApproval: ApprovalRuntime["respondToToolApproval"]
      }
    }).__internal_threadBinding
    return {
      respondToToolApproval: (options) => {
        const responder =
          binding?.respondToToolApproval ??
          ((runtime.thread as unknown as ApprovalRuntime).respondToToolApproval ??
            (() => {
              throw new Error("respondToToolApproval 不可用：审批能力未接入运行时")
            }))
        return responder(options)
      },
    }
  }, [runtime])

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ApprovalRuntimeContext.Provider value={approvalRuntime}>
        {children}
      </ApprovalRuntimeContext.Provider>
    </AssistantRuntimeProvider>
  )
}
