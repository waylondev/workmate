// 后端业务 REST 的轻量封装。开发期经 Vite 代理到 localhost:8080。
// 所有接口复用 AgentScope 官方 Bean 能力（ThreadSessionManager / AguiAgentRegistry /
// AgentSkillRepository / QuartzAgentScheduler），见 docs/design.md。
//
// 错误契约：后端统一返回 RFC 7807 ProblemDetail（400/404/409…），本模块把它转成
// ApiError，UI 因此可以直接展示 `detail` 而不是无信息量的 "400 Bad Request"。

const BASE = "/api"

/** 后端 RFC 7807 错误。`detail` 已从 ProblemDetail 中取出，可直接展示给用户。 */
export class ApiError extends Error {
  readonly status: number

  constructor(status: number, detail: string) {
    super(detail)
    this.name = "ApiError"
    this.status = status
  }
}

async function toApiError(res: Response): Promise<ApiError> {
  let detail = `${res.status} ${res.statusText}`
  try {
    const body: unknown = await res.json()
    if (body && typeof body === "object" && "detail" in body) {
      const { detail: raw } = body as { detail?: unknown }
      if (typeof raw === "string" && raw.length > 0) detail = raw
    }
  } catch {
    // 非 JSON 响应（网关错误页等）保留状态行
  }
  return new ApiError(res.status, detail)
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: "application/json", ...(init?.headers ?? {}) },
    ...init,
  })
  if (!res.ok) throw await toApiError(res)
  return (await res.json()) as T
}

// ---- Agent ----

export type AgentMeta = {
  id: string
  name: string
  description: string
  /** 是否已注册到 AG-UI 路由（`/agui/run/{id}`）。注销可由 registerAgent 恢复。 */
  registered: boolean
  /** 权限模式（如 `default` / `accept-edits` / `explore`），展示层映射为中文标签。 */
  permission: string
}

export async function listAgents(): Promise<AgentMeta[]> {
  return json<AgentMeta[]>(`${BASE}/agents`)
}

export async function listSkills(agentId: string): Promise<SkillMeta[]> {
  return json<SkillMeta[]>(`${BASE}/agents/${agentId}/skills`)
}

export async function unregisterAgent(agentId: string): Promise<AgentMeta> {
  return json<AgentMeta>(`${BASE}/agents/${agentId}`, { method: "DELETE" })
}

export async function registerAgent(agentId: string): Promise<AgentMeta> {
  return json<AgentMeta>(`${BASE}/agents/${agentId}/register`, { method: "POST" })
}

// ---- Skill ----

/** 提供某技能的仓库。`archivedOnDelete` 表明该仓库的删除是归档（可恢复）还是硬删除。 */
export type SkillRepositoryInfo = {
  source: string
  type: string
  location: string
  writable: boolean
  archivedOnDelete: boolean
}

export type SkillMeta = {
  agentId: string
  name: string
  description: string | null
  repositories: SkillRepositoryInfo[]
  /** 是否可删除（存在归档仓库或可写仓库）。 */
  deletable: boolean
}

export type SkillDeletion = {
  agentId: string
  skillName: string
  deleted: boolean
  repository: string
  /** true=已归档（可恢复）；false=硬删除。 */
  archived: boolean
}

export async function deleteSkill(agentId: string, skillName: string): Promise<SkillDeletion> {
  return json<SkillDeletion>(`${BASE}/agents/${agentId}/skills/${skillName}`, { method: "DELETE" })
}

// ---- 会话 ----

export type SessionMeta = {
  agentId: string
  sessionId: string
  /** 该会话所属的 agent 名（`{agentName}`，非 id）。 */
  agentName: string
  /** 会话日志文件最后修改时间（epoch millis）。 */
  updatedAt: number
}

export type SessionDeletion = {
  agentId: string
  sessionId: string
  deleted: boolean
  removedFiles: number
}

export async function listSessions(agentId: string): Promise<SessionMeta[]> {
  return json<SessionMeta[]>(`${BASE}/agents/${agentId}/sessions`)
}

export async function deleteSession(
  agentId: string,
  sessionId: string,
): Promise<SessionDeletion> {
  return json<SessionDeletion>(`${BASE}/agents/${agentId}/sessions/${sessionId}`, {
    method: "DELETE",
  })
}

// ---- 定时任务 ----

export type JobMeta = {
  name: string
  /** 调度器内部任务 id。 */
  id: string
  agentId: string
  cron: string
  /** 已触发次数。 */
  executions: number
}

export type JobCancellation = { name: string; cancelled: boolean }

export async function createJob(job: {
  name: string
  agentId: string
  cronExpression: string
}): Promise<JobMeta> {
  return json<JobMeta>(`${BASE}/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(job),
  })
}

export async function listJobs(): Promise<JobMeta[]> {
  return json<JobMeta[]>(`${BASE}/jobs`)
}

export async function cancelJob(jobName: string): Promise<JobCancellation> {
  return json<JobCancellation>(`${BASE}/jobs/${jobName}`, { method: "DELETE" })
}
