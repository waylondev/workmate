import {
  listAgents,
  unregisterAgent,
  listSkills,
  deleteSkill,
  listJobs,
  createJob,
  cancelJob,
  type AgentMeta,
  type SkillMeta,
  type JobMeta,
} from "@/api"
import { Button } from "@/components/ui/button"
import { useEffect, useState } from "react"

/**
 * 管理面板：Agent 管理 / Skill 管理 / 定时任务。
 * 导航由左侧图标栏控制（见 App.tsx 的 NavRail），本组件根据 initialTab 渲染对应面板。
 * 全部复用后端 AgentScope 官方 Bean 能力（见 docs/design.md）。
 */
export function AdminPanel({ initialTab }: { initialTab: "agents" | "skills" | "jobs" }) {
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="flex h-full flex-col">
      {error && (
        <div className="text-destructive shrink-0 px-4 py-2 text-xs">{error}</div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {initialTab === "agents" && <AgentsPanel setError={setError} />}
        {initialTab === "skills" && <SkillsPanel setError={setError} />}
        {initialTab === "jobs" && <JobsPanel setError={setError} />}
      </div>
    </div>
  )
}

function AgentsPanel({ setError }: { setError: (e: string | null) => void }) {
  const [agents, setAgents] = useState<AgentMeta[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = () => {
    setLoading(true)
    listAgents()
      .then((data) => {
        setAgents(data)
        setError(null)
      })
      .catch((e) => setError(`加载 Agent 失败：${e.message}`))
      .finally(() => setLoading(false))
  }

  useEffect(refresh, [])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">已注册 Agent</h2>
        <Button size="sm" variant="outline" onClick={refresh}>
          刷新
        </Button>
      </div>
      {loading ? (
        <p className="text-muted-foreground text-sm">加载中…</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {agents.map((agent) => (
            <li key={agent.id} className="border-border/60 flex items-center justify-between rounded-lg border p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{agent.name}</p>
                <p className="text-muted-foreground truncate text-xs">{agent.id}</p>
                {agent.description && <p className="text-muted-foreground text-xs">{agent.description}</p>}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  unregisterAgent(agent.id)
                    .then(() => refresh())
                    .catch((e) => setError(`注销失败：${e.message}`))
                }
              >
                注销
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function SkillsPanel({ setError }: { setError: (e: string | null) => void }) {
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
      .catch((e) => setError(`加载 Skill 失败：${e.message}`))
      .finally(() => setLoading(false))
  }

  useEffect(refresh, [agentId])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Skill 列表</h2>
        <div className="flex items-center gap-2">
          <input
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            placeholder="agentId"
            className="border-border bg-background w-32 rounded-md border px-2 py-1 text-xs"
          />
          <Button size="sm" variant="outline" onClick={refresh}>
            刷新
          </Button>
        </div>
      </div>
      {loading ? (
        <p className="text-muted-foreground text-sm">加载中…</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {skills.map((skill) => (
            <li key={skill.name} className="border-border/60 flex items-center justify-between rounded-lg border p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{skill.name}</p>
                {skill.description && <p className="text-muted-foreground text-xs">{skill.description}</p>}
                <p className="text-muted-foreground text-xs">来源：{skill.source}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  deleteSkill(agentId, skill.name)
                    .then(() => refresh())
                    .catch((e) => setError(`删除失败：${e.message}`))
                }
              >
                删除
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function JobsPanel({ setError }: { setError: (e: string | null) => void }) {
  const [jobs, setJobs] = useState<JobMeta[]>([])
  const [name, setName] = useState("")
  const [agentId, setAgentId] = useState("default")
  const [cron, setCron] = useState("")
  const [loading, setLoading] = useState(true)

  const refresh = () => {
    setLoading(true)
    listJobs()
      .then((data) => {
        setJobs(data)
        setError(null)
      })
      .catch((e) => setError(`加载任务失败：${e.message}`))
      .finally(() => setLoading(false))
  }

  useEffect(refresh, [])

  const onCreate = () => {
    if (!name || !cron) {
      setError("任务名和 cron 表达式必填")
      return
    }
    createJob({ name, agentId, cronExpression: cron })
      .then(() => {
        setName("")
        setCron("")
        refresh()
      })
      .catch((e) => setError(`创建失败：${e.message}`))
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-medium">定时任务</h2>
      <div className="border-border/60 flex flex-col gap-2 rounded-lg border p-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="任务名"
          className="border-border bg-background rounded-md border px-2 py-1 text-xs"
        />
        <input
          value={agentId}
          onChange={(e) => setAgentId(e.target.value)}
          placeholder="agentId"
          className="border-border bg-background rounded-md border px-2 py-1 text-xs"
        />
        <input
          value={cron}
          onChange={(e) => setCron(e.target.value)}
          placeholder="cron 表达式，如 0 0 8 * * ?"
          className="border-border bg-background rounded-md border px-2 py-1 text-xs"
        />
        <Button size="sm" onClick={onCreate}>
          创建任务
        </Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">加载中…</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {jobs.map((job) => (
            <li key={job.name} className="border-border/60 flex items-center justify-between rounded-lg border p-3">
              <span className="text-sm font-medium">{job.name}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  cancelJob(job.name)
                    .then(() => refresh())
                    .catch((e) => setError(`取消失败：${e.message}`))
                }
              >
                取消
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
