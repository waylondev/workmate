import {
  cancelJob,
  createJob,
  deleteSkill,
  listAgents,
  listJobExecutions,
  listJobs,
  listSkills,
  registerAgent,
  unregisterAgent,
  type AgentMeta,
  type JobExecution,
  type JobMeta,
  type SkillMeta,
} from "@/api"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useEffect, useState, type ReactNode } from "react"

/**
 * 管理面板：Agent / 技能 / 定时任务。
 *
 * <p>导航由左侧栏控制，本组件按 `initialTab` 渲染对应面板；数据全部来自后端真实接口，
 * 错误信息直接展示后端 RFC 7807 的 `detail`（见 `api.ts` 的 ApiError）。
 */
export function AdminPanel({ initialTab }: { initialTab: "agents" | "skills" | "jobs" }) {
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const report = {
    setError,
    setNotice,
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col px-6">
      {error && (
        <p className="border-destructive/40 bg-destructive/5 text-destructive mt-4 shrink-0 rounded-lg border px-3 py-2 text-xs">
          {error}
        </p>
      )}
      {notice && (
        <p className="border-border/60 bg-muted/40 text-muted-foreground mt-4 shrink-0 rounded-lg border px-3 py-2 text-xs">
          {notice}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto py-4">
        {initialTab === "agents" && <AgentsPanel {...report} />}
        {initialTab === "skills" && <SkillsPanel {...report} />}
        {initialTab === "jobs" && <JobsPanel {...report} />}
      </div>
    </div>
  )
}

type Report = {
  setError: (message: string | null) => void
  setNotice: (message: string | null) => void
}

const fail = (label: string, cause: unknown) => `${label}：${cause instanceof Error ? cause.message : String(cause)}`

function PanelHeading({
  title,
  description,
  onRefresh,
  children,
}: {
  title: string
  description: string
  onRefresh: () => void
  children?: ReactNode
}) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-sm font-medium">{title}</h2>
        <p className="text-muted-foreground mt-0.5 text-xs">{description}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {children}
        <Button size="sm" variant="outline" onClick={onRefresh}>
          刷新
        </Button>
      </div>
    </div>
  )
}

function EmptyRow({ children }: { children: ReactNode }) {
  return (
    <p className="border-border/60 text-muted-foreground rounded-lg border border-dashed px-3 py-4 text-xs">
      {children}
    </p>
  )
}

function AgentsPanel({ setError, setNotice }: Report) {
  const [agents, setAgents] = useState<AgentMeta[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = () => {
    setLoading(true)
    listAgents()
      .then((data) => {
        setAgents(data)
        setError(null)
      })
      .catch((cause: unknown) => setError(fail("加载 Agent 失败", cause)))
      .finally(() => setLoading(false))
  }

  useEffect(refresh, [])

  return (
    <div className="flex flex-col gap-3">
      <PanelHeading
        title="Agent"
        description="定义来自 workmate.agents 配置；此处只切换是否注册到 AG-UI 路由，注销后可重新启用。"
        onRefresh={refresh}
      />
      {loading ? (
        <p className="text-muted-foreground text-sm">加载中…</p>
      ) : agents.length === 0 ? (
        <EmptyRow>没有可用的 agent</EmptyRow>
      ) : (
        <ul className="flex flex-col gap-2">
          {agents.map((agent) => (
            <li
              key={agent.id}
              className="border-border/60 flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium">
                  {agent.name}
                  <span
                    className={cn(
                      "rounded-full border px-1.5 py-px text-[11px] font-normal",
                      agent.registered
                        ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    {agent.registered ? "已启用" : "已注销"}
                  </span>
                </p>
                <p className="text-muted-foreground truncate text-xs">
                  {agent.id} · {agent.description || "无描述"}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const action = agent.registered ? unregisterAgent : registerAgent
                  action(agent.id)
                    .then((next) => {
                      setNotice(`${next.name} ${next.registered ? "已启用" : "已注销"}`)
                      setError(null)
                      refresh()
                    })
                    .catch((cause: unknown) => setError(fail("操作失败", cause)))
                }}
              >
                {agent.registered ? "注销" : "启用"}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function SkillsPanel({ setError, setNotice }: Report) {
  const [agentId, setAgentId] = useState("default")
  const [skills, setSkills] = useState<SkillMeta[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = () => {
    setLoading(true)
    listSkills(agentId)
      .then((data) => {
        setSkills(data)
        setError(null)
      })
      .catch((cause: unknown) => setError(fail("加载技能失败", cause)))
      .finally(() => setLoading(false))
  }

  useEffect(refresh, [agentId])

  return (
    <div className="flex flex-col gap-3">
      <PanelHeading
        title="技能"
        description="列出该 agent 可发现的技能及其来源仓库；workspace 仓库为归档语义，可恢复。"
        onRefresh={refresh}
      >
        <input
          value={agentId}
          onChange={(event) => setAgentId(event.target.value)}
          placeholder="agentId"
          className="border-border bg-background w-28 rounded-md border px-2 py-1 text-xs"
        />
      </PanelHeading>
      {loading ? (
        <p className="text-muted-foreground text-sm">加载中…</p>
      ) : skills.length === 0 ? (
        <EmptyRow>该 agent 暂无可发现的技能（工作区中的 skills 目录为空时会这样）</EmptyRow>
      ) : (
        <ul className="flex flex-col gap-2">
          {skills.map((skill) => (
            <li
              key={skill.name}
              className="border-border/60 flex flex-col gap-2 rounded-xl border px-3 py-2.5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{skill.name}</p>
                  {skill.description && (
                    <p className="text-muted-foreground text-xs">{skill.description}</p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!skill.deletable}
                  title={skill.deletable ? "删除该技能" : "没有可删除的仓库（全部只读）"}
                  onClick={() =>
                    deleteSkill(agentId, skill.name)
                      .then((result) => {
                        setNotice(
                          result.archived
                            ? `${skill.name} 已归档到 ${result.repository}（可恢复）`
                            : `${skill.name} 已从 ${result.repository} 删除`,
                        )
                        setError(null)
                        refresh()
                      })
                      .catch((cause: unknown) => setError(fail("删除失败", cause)))
                  }
                >
                  删除
                </Button>
              </div>
              <ul className="flex flex-col gap-1">
                {skill.repositories.map((repository) => (
                  <li
                    key={`${skill.name}-${repository.source}`}
                    className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-[11px]"
                  >
                    <span className="border-border/70 rounded border px-1.5 py-px font-mono">
                      {repository.source}
                    </span>
                    <span>{repository.type}</span>
                    <span className={repository.writable ? "text-emerald-600 dark:text-emerald-400" : ""}>
                      {repository.writable ? "可写" : "只读"}
                    </span>
                    {repository.archivedOnDelete && <span>· 删除即归档</span>}
                    <span className="truncate font-mono">{repository.location}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function JobsPanel({ setError, setNotice }: Report) {
  const [jobs, setJobs] = useState<JobMeta[]>([])
  const [name, setName] = useState("")
  const [agentId, setAgentId] = useState("default")
  const [cron, setCron] = useState("")
  const [loading, setLoading] = useState(true)
  // 展开的执行历史：jobName → 记录列表
  const [executions, setExecutions] = useState<Record<string, JobExecution[]>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const refresh = () => {
    setLoading(true)
    listJobs()
      .then((data) => {
        setJobs(data)
        setError(null)
      })
      .catch((cause: unknown) => setError(fail("加载定时任务失败", cause)))
      .finally(() => setLoading(false))
  }

  useEffect(refresh, [])

  const toggleExecutions = (jobName: string) => {
    const isExpanded = expanded[jobName]
    setExpanded((prev) => ({ ...prev, [jobName]: !isExpanded }))
    if (!isExpanded) {
      listJobExecutions(jobName)
        .then((data) => setExecutions((prev) => ({ ...prev, [jobName]: data })))
        .catch((cause: unknown) => setError(fail("加载执行历史失败", cause)))
    }
  }

  const onCreate = () => {
    if (!name || !cron) {
      setError("任务名与 cron 表达式都必填")
      return
    }
    createJob({ name, agentId, cronExpression: cron })
      .then((job) => {
        setNotice(`已创建 ${job.name}（${job.cron} → ${job.agentId}）`)
        setError(null)
        setName("")
        setCron("")
        refresh()
      })
      .catch((cause: unknown) => setError(fail("创建失败", cause)))
  }

  return (
    <div className="flex flex-col gap-3">
      <PanelHeading
        title="定时任务"
        description="Quartz 每次触发都会新建 ReActAgent，因此任务不共享对话工作区、记忆与技能。"
        onRefresh={refresh}
      />

      <div className="border-border/60 flex flex-col gap-2 rounded-xl border px-3 py-2.5">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="任务名"
            className="border-border bg-background min-w-0 flex-1 rounded-md border px-2 py-1 text-xs"
          />
          <input
            value={agentId}
            onChange={(event) => setAgentId(event.target.value)}
            placeholder="agentId"
            className="border-border bg-background w-full rounded-md border px-2 py-1 text-xs sm:w-28"
          />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={cron}
            onChange={(event) => setCron(event.target.value)}
            placeholder="cron 表达式，如 0 0 8 * * ?"
            className="border-border bg-background min-w-0 flex-1 rounded-md border px-2 py-1 font-mono text-xs"
          />
          <Button size="sm" onClick={onCreate} className="sm:w-24">
            创建任务
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">加载中…</p>
      ) : jobs.length === 0 ? (
        <EmptyRow>还没有定时任务</EmptyRow>
      ) : (
        <ul className="flex flex-col gap-2">
          {jobs.map((job) => (
            <li
              key={job.name}
              className="border-border/60 flex flex-col rounded-xl border px-3 py-2.5"
            >
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => toggleExecutions(job.name)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-sm font-medium">{job.name}</p>
                  <p className="text-muted-foreground truncate font-mono text-xs">
                    {job.cron} · {job.agentId} · 已触发 {job.executions} 次
                  </p>
                </button>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => toggleExecutions(job.name)}
                  >
                    {expanded[job.name] ? "收起" : "执行记录"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      cancelJob(job.name)
                        .then((result) => {
                          setNotice(result.cancelled ? `${job.name} 已取消` : `${job.name} 本就不存在`)
                          setError(null)
                          refresh()
                        })
                        .catch((cause: unknown) => setError(fail("取消失败", cause)))
                    }
                  >
                    取消
                  </Button>
                </div>
              </div>

              {expanded[job.name] && (
                <div className="mt-2 flex flex-col gap-1.5 border-t pt-2">
                  {(executions[job.name] ?? []).length === 0 ? (
                    <p className="text-muted-foreground text-xs">暂无执行记录</p>
                  ) : (
                    (executions[job.name] ?? []).map((ex, idx) => (
                      <ExecutionRow key={`${ex.startedAt}-${idx}`} execution={ex} />
                    ))
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** 单条执行记录：时间、状态、token 用量与输出/错误摘要。 */
function ExecutionRow({ execution }: { execution: JobExecution }) {
  const status = execution.status === "success"
  const started = new Date(execution.startedAt).toLocaleString()
  const tokens =
    execution.inputTokens != null || execution.outputTokens != null
      ? `（in ${execution.inputTokens ?? 0} / out ${execution.outputTokens ?? 0}）`
      : ""

  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-lg border px-2.5 py-2 text-xs",
        status ? "border-border/60" : "border-destructive/40 bg-destructive/5",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "inline-block h-2 w-2 shrink-0 rounded-full",
            status ? "bg-emerald-500" : "bg-red-500",
          )}
        />
        <span className="font-medium">{status ? "成功" : "失败"}</span>
        <span className="text-muted-foreground">{started}</span>
        <span className="text-muted-foreground ml-auto font-mono">{tokens}</span>
      </div>
      {status && execution.output ? (
        <p className="text-muted-foreground line-clamp-3 whitespace-pre-wrap">{execution.output}</p>
      ) : (
        <p className="text-destructive line-clamp-3">{execution.error ?? "未知错误"}</p>
      )}
    </div>
  )
}
