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
