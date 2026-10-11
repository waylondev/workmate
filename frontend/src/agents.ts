export type AgentInfo = {
  id: string
  name: string
  description: string
  /** 与后端 application.yaml 的 `permission-mode` 对应，仅用于界面提示。 */
  permission: string
}

// 与后端 application.yaml 的 workmate.agents 保持一致：key 即 AG-UI 路由段 `/agui/run/{id}`。
export const AGENTS: AgentInfo[] = [
  {
    id: "default",
    name: "Workmate",
    description: "通用助手，非只读操作会请求你的审批",
    permission: "需审批",
  },
  {
    id: "coder",
    name: "Coder",
    description: "编码助手，工作区内的编辑自动放行",
    permission: "自动放行",
  },
  {
    id: "explorer",
    name: "Explorer",
    description: "只读分析，不执行任何写操作",
    permission: "只读",
  },
]

export const agentById = (agentId: string): AgentInfo => AGENTS.find((a) => a.id === agentId) ?? AGENTS[0]
