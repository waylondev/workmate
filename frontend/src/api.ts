// 后端业务 REST 的轻量封装。开发期经 Vite 代理到 localhost:8080。
// 所有接口复用 AgentScope 官方 Bean 能力（ThreadSessionManager / AguiAgentRegistry /
// AgentSkillRepository / QuartzAgentScheduler），见 docs/design.md。

const BASE = "/api"

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: "application/json", ...(init?.headers ?? {}) },
    ...init,
  })
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<T>
}

// ---- 会话 ----
export type SessionMeta = {
  threadId: string
  agentId: string
  title: string
  updatedAt: number
}

export async function listSessions(): Promise<SessionMeta[]> {
  return json<SessionMeta[]>(`${BASE}/sessions`)
}

export async function deleteSession(threadId: string): Promise<{ removed: boolean }> {
  return json(`${BASE}/sessions/${threadId}`, { method: "DELETE" })
}

// ---- Agent ----
export type AgentMeta = {
  id: string
  name: string
  description: string
}

export async function listAgents(): Promise<AgentMeta[]> {
  return json<AgentMeta[]>(`${BASE}/agents`)
}

export async function unregisterAgent(agentId: string): Promise<{ unregistered: boolean }> {
  return json(`${BASE}/agents/${agentId}`, { method: "DELETE" })
}

// ---- Skill ----
export type SkillMeta = {
  agentId: string
  name: string
  description: string | null
  source: string
}

export async function listSkills(agentId: string): Promise<SkillMeta[]> {
  return json<SkillMeta[]>(`${BASE}/agents/${agentId}/skills`)
}

export async function deleteSkill(agentId: string, skillName: string): Promise<{ deleted: boolean }> {
  return json(`${BASE}/agents/${agentId}/skills/${skillName}`, { method: "DELETE" })
}

// ---- 定时任务 ----
export type JobMeta = {
  name: string
}

export async function createJob(job: { name: string; agentId: string; cronExpression: string }): Promise<{ name: string; scheduled: boolean }> {
  return json(`${BASE}/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(job),
  })
}

export async function listJobs(): Promise<JobMeta[]> {
  return json<JobMeta[]>(`${BASE}/jobs`)
}

export async function cancelJob(jobName: string): Promise<{ cancelled: boolean }> {
  return json(`${BASE}/jobs/${jobName}`, { method: "DELETE" })
}
