import { listJobs, listSkills, type JobMeta, type SkillMeta } from "@/api"
import { TooltipIconButton } from "@/components/tooltip-icon-button"
import { cn } from "@/lib/utils"
import { deriveArtifacts, deriveRecentFiles, deriveWorkSteps, type StepStatus } from "@/work-progress"
import { useAuiState } from "@assistant-ui/react"
import {
  CheckIcon,
  ClockIcon,
  FileIcon,
  LoaderCircleIcon,
  PanelRightCloseIcon,
  RefreshCwIcon,
  WrenchIcon,
  XIcon,
} from "lucide-react"
import { useEffect, useMemo, useState, type ReactNode } from "react"

/**
 * 右侧「对话摘要」面板。
 *
 * <p>数据来源分两类，互不混淆：
 * - **工作进度 / 对话产物 / 最近文件**：由当前线程的消息派生（见 `work-progress.ts`），
 *   随 AG-UI 事件实时更新，不使用任何本地猜测状态。
 * - **后台任务 / 技能**：来自后端真实接口（`/api/jobs`、`/api/agents/{id}/skills`）。
 *
 * <p>本组件必须渲染在 `AssistantRuntimeProvider` 之内（依赖 `useAuiState`）。
 */
export function ConversationSummaryPanel({
  agentId,
  onClose,
}: {
  agentId: string
  onClose: () => void
}) {
  const messages = useAuiState((s) => s.thread.messages)
  const isRunning = useAuiState((s) => s.thread.isRunning)

  const steps = useMemo(() => deriveWorkSteps(messages), [messages])
  const artifacts = useMemo(() => deriveArtifacts(messages), [messages])
  const files = useMemo(() => deriveRecentFiles(messages), [messages])

  const [jobs, setJobs] = useState<JobMeta[]>([])
  const [skills, setSkills] = useState<SkillMeta[]>([])
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let alive = true
    Promise.all([listJobs(), listSkills(agentId)])
      .then(([nextJobs, nextSkills]) => {
        if (!alive) return
        setJobs(nextJobs)
        setSkills(nextSkills)
        setError(null)
      })
      .catch((cause: unknown) => {
        if (!alive) return
        setError(cause instanceof Error ? cause.message : String(cause))
      })
    return () => {
      alive = false
    }
  }, [agentId, reloadKey])

  return (
    <aside className="glass border-border/60 relative z-10 flex w-72 shrink-0 flex-col border-l">
      <header className="flex h-14 shrink-0 items-center gap-1 px-3">
        <span className="text-sm font-medium">对话摘要</span>
        <div className="ms-auto flex items-center gap-1">
          <TooltipIconButton
            tooltip="刷新后台任务与技能"
            onClick={() => setReloadKey((value) => value + 1)}
            aria-label="刷新后台任务与技能"
          >
            <RefreshCwIcon />
          </TooltipIconButton>
          <TooltipIconButton tooltip="收起右栏" onClick={onClose} aria-label="收起右栏">
            <PanelRightCloseIcon />
          </TooltipIconButton>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {error && <p className="text-destructive mb-1 text-xs">后台数据加载失败：{error}</p>}

        <Section
          id="progress"
          title="工作进度"
          hint={isRunning ? "进行中" : steps.length > 0 ? `${steps.length} 步` : undefined}
        >
          {steps.length === 0 ? (
            <Empty>对话开始后自动汇总</Empty>
          ) : (
            <ol className="flex flex-col gap-2">
              {steps.map((step) => (
                <li key={step.id} className="flex items-start gap-2">
                  <StepIcon status={step.status} />
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "truncate text-[13px] leading-5",
                        step.status === "done" ? "text-muted-foreground" : "text-foreground",
                      )}
                    >
                      {step.label}
                    </p>
                    {step.detail && (
                      <p className="text-muted-foreground/80 truncate font-mono text-[11px] leading-4">
                        {step.detail}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Section>

        <Section id="artifacts" title="对话产物" hint={artifacts.length > 0 ? `${artifacts.length}` : undefined} first>
          {artifacts.length === 0 ? (
            <Empty>暂无产物</Empty>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {artifacts.map((artifact) => (
                <li key={artifact.id} className="text-foreground flex items-center gap-2 text-[13px]">
                  <FileIcon className="text-muted-foreground size-3.5 shrink-0" />
                  <span className="truncate">{artifact.name}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section id="jobs" title="后台任务" hint={jobs.length > 0 ? `${jobs.length}` : undefined}>
          {jobs.length === 0 ? (
            <Empty>没有定时任务</Empty>
          ) : (
            <ul className="flex flex-col gap-2">
              {jobs.map((job) => (
                <li key={job.name} className="flex items-start gap-2">
                  <ClockIcon className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-foreground truncate text-[13px] leading-5">
                      {job.name}
                      {job.agentId !== agentId && (
                        <span className="text-muted-foreground/80 ms-1 text-[11px]">@{job.agentId}</span>
                      )}
                    </p>
                    <p className="text-muted-foreground/80 truncate font-mono text-[11px] leading-4">
                      {job.cron} · 已触发 {job.executions} 次
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section id="skills" title="技能" hint={skills.length > 0 ? `${skills.length}` : undefined}>
          {skills.length === 0 ? (
            <Empty>该 agent 暂无可发现的技能</Empty>
          ) : (
            <ul className="flex flex-col gap-2">
              {skills.map((skill) => (
                <li key={skill.name} className="flex items-start gap-2">
                  <WrenchIcon className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-foreground truncate text-[13px] leading-5">{skill.name}</p>
                    <p className="text-muted-foreground/80 truncate text-[11px] leading-4">
                      {skill.repositories.map((repository) => repository.source).join(" / ") || "无来源仓库"}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section id="files" title="最近文件" hint={files.length > 0 ? `${files.length}` : undefined}>
          {files.length === 0 ? (
            <Empty>暂无文件</Empty>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {files.map((file) => (
                <li key={file.id} className="text-foreground flex items-center gap-2 text-[13px]">
                  <FileIcon className="text-muted-foreground size-3.5 shrink-0" />
                  <span className="truncate">{file.name}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </aside>
  )
}

function Section({
  id,
  title,
  hint,
  first = false,
  children,
}: {
  id: string
  title: string
  hint?: string | undefined
  first?: boolean
  children: ReactNode
}) {
  return (
    <section
      id={`summary-${id}`}
      className={cn("scroll-mt-2 pb-1", !first && "border-border/60 mt-4 border-t pt-3")}
    >
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-muted-foreground text-xs font-medium">{title}</h3>
        {hint && <span className="text-muted-foreground/70 text-[11px]">{hint}</span>}
      </div>
      {children}
    </section>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-muted-foreground/70 text-xs">{children}</p>
}

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "done") {
    return <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-emerald-500" aria-label="已完成" />
  }
  if (status === "failed") {
    return <XIcon className="text-destructive mt-0.5 size-3.5 shrink-0" aria-label="失败" />
  }
  return (
    <LoaderCircleIcon
      className="mt-0.5 size-3.5 shrink-0 animate-spin text-sky-500"
      aria-label="进行中"
    />
  )
}
