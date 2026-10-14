import type { AgentMeta } from "@/api"

/** 前端消费的 agent 信息。与后端 `AgentView`（`GET /api/agents`）一一对应。 */
export type AgentInfo = {
  id: string
  name: string
  description: string
  /** 权限模式原文（`default` / `accept-edits` / `explore` …）。 */
  permission: string
}

/**
 * 权限模式 → 界面中文标签。仅用于展示，不是权威数据：权威来源是后端
 * `PermissionMode.getValue()`（返回下划线蛇形，如 `accept_edits`），此处只做 UI 文案映射。
 */
const PERMISSION_LABELS: Record<string, string> = {
  default: "需审批",
  accept_edits: "自动放行",
  explore: "只读",
  bypass: "全部放行",
  dont_ask: "静默拒绝",
}

/** 权限模式的界面中文标签，未知值回退为原文。 */
export function permissionLabel(permission: string): string {
  return PERMISSION_LABELS[permission] ?? permission
}

/**
 * 权限模式 → 徽章配色类。用语义色表达「放行程度 / 风险」：
 * 需审批=amber（要人工确认）、自动放行=emerald（编辑免审）、只读=sky、
 * 全部放行=red（危险，对标业内 bypass 的降权警示）、静默拒绝=灰。
 */
const PERMISSION_TONES: Record<string, string> = {
  default: "border-amber-400/40 bg-amber-400/10 text-amber-500 dark:text-amber-400",
  accept_edits: "border-emerald-400/40 bg-emerald-400/10 text-emerald-600 dark:text-emerald-400",
  explore: "border-sky-400/40 bg-sky-400/10 text-sky-600 dark:text-sky-400",
  bypass: "border-red-400/40 bg-red-400/10 text-red-600 dark:text-red-400",
  dont_ask: "border-border bg-muted text-muted-foreground",
}

/** 权限模式的徽章配色类，未知值回退为中性灰。 */
export function permissionTone(permission: string): string {
  return PERMISSION_TONES[permission] ?? "border-border bg-muted text-muted-foreground"
}

/** 把后端 `AgentMeta` 转为前端 `AgentInfo`（纯映射，不增删字段）。 */
export function toAgentInfo(meta: AgentMeta): AgentInfo {
  return {
    id: meta.id,
    name: meta.name,
    description: meta.description,
    permission: meta.permission,
  }
}

/** 按 id 查找 agent；找不到时回退到列表首项（调用方保证列表非空）。 */
export function agentById(agents: AgentInfo[], agentId: string): AgentInfo | undefined {
  return agents.find((agent) => agent.id === agentId) ?? agents[0]
}
