// 左侧栏的功能分区键。chat 是对话视图，其余三个是管理面板。

export type NavKey = "chat" | "agents" | "skills" | "jobs"

export type AdminKey = Exclude<NavKey, "chat">

export const NAV_TITLES: Record<AdminKey, string> = {
  agents: "Agent 管理",
  skills: "技能",
  jobs: "定时任务",
}
