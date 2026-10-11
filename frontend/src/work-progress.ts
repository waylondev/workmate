// 从 AG-UI 线程消息派生「工作进度」与「对话产物」。
//
// 纯函数、无副作用：右侧摘要面板只负责渲染，派生逻辑集中在这里，便于单独推理与复用。
// 线程消息类型统一取自 `thread-types.ts`（直接沿用 assistant-ui 的线程状态类型），
// 不复制一份并行定义，避免与库版本漂移。

import type { ThreadMessages, ThreadPart, ToolCallPart } from "@/thread-types"

export type StepStatus = "done" | "running" | "failed"

/** 一条工作进度：来自一次工具调用（或收尾的回答生成）。 */
export type WorkStep = {
  id: string
  /** 面向人的动作描述，例如「执行命令」。 */
  label: string
  /** 关键参数 / 目标的单行摘要，用于区分同名步骤。 */
  detail?: string
  status: StepStatus
}

export type Artifact = {
  id: string
  name: string
  kind: "file" | "image"
  /** 图片部件可直接作为图片源渲染。 */
  previewUrl?: string
}

const toolLabels: readonly (readonly [string, string])[] = [
  ["shell", "执行命令"],
  ["command", "执行命令"],
  ["bash", "执行命令"],
  ["terminal", "执行命令"],
  ["read", "读取文件"],
  ["write", "写入文件"],
  ["edit", "修改文件"],
  ["patch", "修改文件"],
  ["grep", "搜索内容"],
  ["search", "检索"],
  ["glob", "查找文件"],
  ["list", "浏览目录"],
  ["ls", "浏览目录"],
  ["todo", "更新任务清单"],
  ["web", "联网检索"],
  ["fetch", "抓取网页"],
  ["http", "请求接口"],
  ["skill", "调用技能"],
  ["task", "派发子任务"],
  ["browser", "操作浏览器"],
]

/** 工具名 → 动作描述；识别不了就退回原始工具名（不编造语义）。 */
export function toolLabel(toolName: string): string {
  const lower = toolName.toLowerCase()
  for (const [needle, label] of toolLabels) {
    if (lower.includes(needle)) return label
  }
  return toolName
}

const detailKeys = [
  "command",
  "cmd",
  "path",
  "file_path",
  "filePath",
  "pattern",
  "query",
  "url",
  "skill",
  "task",
  "name",
] as const

const compact = (value: unknown, max = 72): string | undefined => {
  if (typeof value === "string") {
    const oneLine = value.replace(/\s+/g, " ").trim()
    if (oneLine.length === 0) return undefined
    return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (Array.isArray(value)) {
    const parts = value.map((item) => compact(item, 24)).filter((item): item is string => !!item)
    return parts.length > 0 ? compact(parts.join(", "), max) : undefined
  }
  if (value && typeof value === "object") {
    try {
      return compact(JSON.stringify(value), max)
    } catch {
      return undefined
    }
  }
  return undefined
}

/** 从工具参数里挑一个最能说明「在做什么」的字段。 */
export function toolDetail(args: unknown): string | undefined {
  if (!args || typeof args !== "object") return undefined
  const record = args as Record<string, unknown>
  for (const key of detailKeys) {
    const hit = compact(record[key])
    if (hit) return hit
  }
  const first = Object.values(record).find((value) => compact(value) !== undefined)
  return compact(first)
}

const isRunningStatus = (part: ToolCallPart): boolean => {
  const status = part.status
  if (status.type === "running") return true
  // 等待人工审批 / 用户输入时，这一步同样没有结束
  return status.type === "requires-action"
}

const stepStatus = (part: ToolCallPart): StepStatus => {
  if (isRunningStatus(part)) return "running"
  if (part.isError) return "failed"
  if (part.status.type === "incomplete") return "failed"
  return "done"
}

const textOf = (parts: readonly ThreadPart[]): string =>
  parts
    .filter((part): part is Extract<ThreadPart, { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("")
    .trim()

/**
 * 派生工作进度。
 *
 * <p>顺序即发生顺序。最后一条助手消息若只有文本、没有工具调用，则补一条「生成回答」，
 * 使运行中的会话始终有一个进行中的收尾步骤（与豆包右栏的观感一致，但状态完全来自真实事件）。
 */
export function deriveWorkSteps(messages: ThreadMessages): WorkStep[] {
  const steps: WorkStep[] = []

  messages.forEach((message, messageIndex) => {
    if (message.role !== "assistant") return

    const parts = message.parts
    const toolParts = parts.filter((part): part is ToolCallPart => part.type === "tool-call")

    // 有工具调用的消息，用「思考」代表其推理阶段；纯文本消息不额外造思考步骤
    if (toolParts.length > 0) {
      const reasoning = parts.find((part) => part.type === "reasoning")
      if (reasoning) {
        steps.push({
          id: `${message.id}-reasoning`,
          label: "分析问题",
          status: reasoning.status?.type === "running" ? "running" : "done",
        })
      }
    }

    for (const part of toolParts) {
      const detail = toolDetail(part.args)
      steps.push({
        id: part.toolCallId,
        label: toolLabel(part.toolName),
        ...(detail !== undefined && { detail }),
        status: stepStatus(part),
      })
    }

    const text = textOf(parts)
    const settled = message.status?.type === "complete" || message.status?.type === "incomplete"
    if (text.length > 0 && toolParts.length === 0 && messageIndex === messages.length - 1) {
      steps.push({
        id: `${message.id}-answer`,
        label: settled ? "生成回答" : "正在回答",
        status: settled ? "done" : "running",
      })
    }
  })

  return steps
}

/** 派生对话产物：助手产出的文件 / 图片。 */
export function deriveArtifacts(messages: ThreadMessages): Artifact[] {
  const artifacts: Artifact[] = []

  messages.forEach((message) => {
    if (message.role !== "assistant") return
    message.parts.forEach((part, partIndex) => {
      if (part.type === "file") {
        artifacts.push({
          id: `${message.id}-${partIndex}`,
          name: part.filename ?? part.mimeType,
          kind: "file",
        })
      } else if (part.type === "image") {
        artifacts.push({
          id: `${message.id}-${partIndex}`,
          name: part.filename ?? "图片",
          kind: "image",
          previewUrl: part.image,
        })
      }
    })
  })

  return artifacts
}

/** 派生最近文件：用户上传与助手产出的文件，按文件名去重，最新的在前。 */
export function deriveRecentFiles(messages: ThreadMessages): Artifact[] {
  const seen = new Set<string>()
  const files: Artifact[] = []

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (!message) continue
    for (const part of message.parts) {
      const name = part.type === "file" ? (part.filename ?? part.mimeType) : undefined
      if (!name || seen.has(name)) continue
      seen.add(name)
      files.push({ id: `${message.id}-file`, name, kind: "file" })
    }
  }

  return files
}
