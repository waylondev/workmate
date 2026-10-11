"use client"

import { derivePendingApprovals, type PendingApproval } from "@/approvals"
import { useApprovalRuntime } from "@/ag-ui-runtime-provider"
import { cn } from "@/lib/utils"
import { useAuiState } from "@assistant-ui/react"
import {
  CheckIcon,
  LoaderCircleIcon,
  ShieldAlertIcon,
  XIcon,
  ZapIcon,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

/**
 * 置顶的全局授权横幅。
 *
 * <p>当线程里出现待授权的工具调用时，在对话区顶部浮出一条高对比横幅，
 * 列出卡住的工具，并直接给出「允许 / 拒绝 / 全部允许」。用户无需点开
 * 工具卡才能发现需要授权。
 *
 * <p>「全部允许」会一次性批准当前所有待授权项；「允许」只批准第一个。
 * 「本会话自动批准」开关（`autoApprove`）由调用方持有并传入：开启后本会话
 * 内后续出现的授权会自动放行，属内存态、不落盘。
 */
export function ApprovalBanner({
  className,
  onAllowAllChange,
  autoApprove,
}: {
  className?: string
  /** 「本会话自动批准」开关状态回传（内存态，调用方持有）。 */
  onAllowAllChange?: (enabled: boolean) => void
  /** 是否已开启「本会话自动批准」，开启后自动批准新出现的授权。 */
  autoApprove?: boolean
}) {
  const approvalRuntime = useApprovalRuntime()
  const messages = useAuiState((s) => s.thread.messages)
  const pending = useMemo(
    () => derivePendingApprovals(messages),
    [messages],
  )

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 「本会话自动批准」开关状态（由调用方持有，本组件只读）。
  const allowAll = autoApprove ?? false

  const respond = useCallback(
    async (approvalId: string, approved: boolean) => {
      await approvalRuntime?.respondToToolApproval({ approvalId, approved })
    },
    [approvalRuntime],
  )

  // 自动批准：开启「全部允许」后，新出现的待授权项立即放行。
  const lastAutoHandled = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!allowAll) return
    for (const item of pending) {
      if (lastAutoHandled.current.has(item.approvalId)) continue
      lastAutoHandled.current.add(item.approvalId)
      void respond(item.approvalId, true).catch(() => {
        lastAutoHandled.current.delete(item.approvalId)
      })
    }
  }, [allowAll, pending, respond])

  if (pending.length === 0) return null

  const run = async (action: "allow" | "deny" | "allow-all") => {
    setSubmitting(true)
    setError(null)
    try {
      if (action === "allow-all") {
        for (const item of pending) {
          await respond(item.approvalId, true)
        }
        onAllowAllChange?.(true)
      } else {
        // 允许/拒绝第一个（横幅按顺序展示，用户逐项处理）
        const target = pending[0]
        await respond(target.approvalId, action === "allow")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  const toolNames = pending.map((item) => item.toolName)
  const first = pending[0]

  return (
    <div
      data-slot="approval-banner"
      role="alert"
      aria-live="assertive"
      className={cn(
        "border-amber-400/40 bg-amber-400/10 text-foreground animate-in fade-in slide-in-from-top-2 relative z-20 mx-3 mt-3 flex shrink-0 items-start gap-3 overflow-hidden rounded-xl border p-3.5 duration-200",
        className,
      )}
    >
      {/* 脉冲光晕 */}
      <div
        aria-hidden
        className="bg-amber-400/20 pointer-events-none absolute inset-0 animate-pulse"
      />
      <ShieldAlertIcon
        aria-hidden
        className="text-amber-400 relative mt-0.5 size-5 shrink-0"
      />
      <div className="relative min-w-0 flex-1">
        <p className="text-sm font-semibold leading-snug">
          需要你的授权才能继续
        </p>
        <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
          {toolNames.length > 1 ? (
            <>
              有 <b className="text-foreground">{toolNames.length}</b> 个工具正在等待批准：
              <code className="bg-amber-400/10 ms-1 rounded px-1.5 py-0.5 font-mono">
                {toolNames.join("、")}
              </code>
            </>
          ) : (
            <>
              工具
              <code className="bg-amber-400/10 mx-1 rounded px-1.5 py-0.5 font-mono">
                {first.toolName}
              </code>
              正在请求执行权限
            </>
          )}
        </p>
        {first.prompt ? (
          <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">{first.prompt}</p>
        ) : null}
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={submitting}
            onClick={() => run("allow")}
            className="bg-emerald-500 hover:bg-emerald-400 text-white inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors disabled:opacity-60"
          >
            <CheckIcon className="size-3.5" aria-hidden />
            允许
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => run("allow-all")}
            className="bg-amber-400 hover:bg-amber-300 text-black inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors disabled:opacity-60"
          >
            <ZapIcon className="size-3.5" aria-hidden />
            全部允许
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => run("deny")}
            className="border-border/60 text-muted-foreground hover:text-foreground hover:bg-accent inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors disabled:opacity-60"
          >
            <XIcon className="size-3.5" aria-hidden />
            拒绝
          </button>
          <label className="text-muted-foreground ml-1 inline-flex cursor-pointer items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={allowAll}
              disabled={submitting}
              onChange={(event) => onAllowAllChange?.(event.target.checked)}
              className="size-3.5 accent-amber-400"
            />
            本会话内自动批准
          </label>
          {submitting && (
            <LoaderCircleIcon
              className="text-amber-400 size-4 animate-spin"
              aria-label="处理中"
            />
          )}
        </div>
        {error ? (
          <p className="text-destructive mt-1.5 text-xs">{error}</p>
        ) : null}
      </div>
    </div>
  )
}

export type { PendingApproval }
