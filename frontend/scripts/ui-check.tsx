// 临时校验入口（校验后删除）：在真实模块图上做两件事——
// 1) SSR 渲染三栏外壳，确认新结构可挂载且关键文案存在；
// 2) 用合成消息验证「工作进度」派生逻辑的状态判定。
//
// 说明：本机浏览器自动化不可用，这是在不依赖 Chromium 的前提下对 UI 层取得的最强证据。

type Bag = Record<string, unknown>

const memory = new Map<string, string>()

const installStubs = () => {
  const g = globalThis as unknown as Bag
  g.localStorage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => void memory.set(key, value),
    removeItem: (key: string) => void memory.delete(key),
  }
  g.window = {
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  }
  g.document = {
    documentElement: { classList: { toggle() {} } },
    getElementById: () => null,
    addEventListener() {},
    removeEventListener() {},
  }
  g.requestAnimationFrame = (callback: () => void) => {
    callback()
    return 0
  }
}

installStubs()

let failures = 0
const check = (label: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? `  ${extra}` : ""}`)
  if (!ok) failures += 1
}

// ---- 1) SSR 渲染 ----
try {
  const { renderToString } = await import("react-dom/server")
  const { default: App } = await import("@/App")
  // 必须交给 React 渲染，不能直接调用组件函数（否则 hook 无宿主）
  const html = renderToString(<App />)
  const expected = [
    "Workmate",
    "新建对话",
    "Agent 管理",
    "最近",
    "本地用户",
    "对话摘要",
    "工作进度",
    "对话产物",
    "后台任务",
    "技能",
    "最近文件",
  ]
  const missing = expected.filter((text) => !html.includes(text))
  const { writeFileSync } = await import("node:fs")
  writeFileSync(".ui-check/render.html", html)
  check("SSR 渲染三栏外壳", html.length > 2000, `html=${html.length}B`)
  check("三栏顺序：侧栏 → 中栏 → 摘要面板", html.indexOf("Agent 管理") < html.indexOf("aui-composer") && html.indexOf("aui-composer") < html.indexOf("summary-progress"), "")
  check("技能 chip 与进度锚点存在", html.includes("aui-composer-chips") && html.includes("summary-progress"), "")
  check("关键文案齐全", missing.length === 0, missing.length ? `缺失: ${missing.join(", ")}` : "")
  check("中栏顶栏存在", html.includes("发消息或创建任务") || html.includes("aui-composer"), "")
} catch (cause) {
  check("SSR 渲染三栏外壳", false, String(cause))
}

// ---- 2) 工作进度派生 ----
try {
  const { deriveWorkSteps, toolLabel } = await import("@/work-progress")
  type Messages = Parameters<typeof deriveWorkSteps>[0]

  const messages = [
    {
      id: "m1",
      role: "assistant",
      parts: [
        {
          type: "tool-call",
          toolCallId: "t1",
          toolName: "execute_shell_command",
          args: { command: "ls -la\npwd" },
          argsText: "",
          status: { type: "complete" },
        },
        {
          type: "tool-call",
          toolCallId: "t2",
          toolName: "read_file",
          args: { path: "D:/repo/README.md" },
          argsText: "",
          status: { type: "running" },
        },
        {
          type: "tool-call",
          toolCallId: "t3",
          toolName: "update_todo_list",
          args: {},
          argsText: "",
          status: { type: "complete" },
          isError: true,
        },
      ],
    },
  ] as unknown as Messages

  const steps = deriveWorkSteps(messages)
  check("步骤数量 = 工具调用数", steps.length === 3, `实际 ${steps.length}`)
  check(
    "动作描述本地化",
    steps[0]?.label === "执行命令" && steps[1]?.label === "读取文件",
    `${steps[0]?.label} / ${steps[1]?.label}`,
  )
  check("参数摘要去掉换行", steps[0]?.detail === "ls -la pwd", String(steps[0]?.detail))
  check(
    "状态判定 done/running/failed",
    steps[0]?.status === "done" && steps[1]?.status === "running" && steps[2]?.status === "failed",
    steps.map((step) => step.status).join(","),
  )
  check("未知工具名不编造语义", toolLabel("mystery_tool") === "mystery_tool", toolLabel("mystery_tool"))
} catch (cause) {
  check("工作进度派生", false, String(cause))
}

// ---- 3) 待授权派生（全部允许 / 醒目横幅的数据源）----
try {
  const { derivePendingApprovals } = await import("@/approvals")
  type Messages = Parameters<typeof derivePendingApprovals>[0]

  const withApproval = [
    {
      id: "a1",
      role: "assistant",
      parts: [
        {
          type: "tool-call",
          toolCallId: "t1",
          toolName: "list_files",
          args: {},
          argsText: "",
          status: { type: "requires-action", reason: "interrupt" },
          approval: { id: "approval-1", prompt: "list_files 需要授权" },
        },
        {
          type: "tool-call",
          toolCallId: "t2",
          toolName: "glob_files",
          args: {},
          argsText: "",
          status: { type: "requires-action", reason: "interrupt" },
          approval: { id: "approval-2", approved: true },
        },
        {
          type: "tool-call",
          toolCallId: "t3",
          toolName: "read_file",
          args: {},
          argsText: "",
          status: { type: "complete" },
        },
      ],
    },
  ] as unknown as Messages

  const pending = derivePendingApprovals(withApproval)
  check("待授权项只统计 approved 未定的", pending.length === 1, `实际 ${pending.length}`)
  check("解析出工具名", pending[0]?.toolName === "list_files", String(pending[0]?.toolName))
  check("解析出 approvalId", pending[0]?.approvalId === "approval-1", String(pending[0]?.approvalId))
  check("已批准/已完成的不计入", !pending.some((p) => p.toolName === "glob_files" || p.toolName === "read_file"), "")

  const none = derivePendingApprovals([] as unknown as Messages)
  check("空线程无待授权", none.length === 0, String(none.length))
} catch (cause) {
  check("待授权派生", false, String(cause))
}

console.log(failures === 0 ? "全部通过" : `${failures} 项失败`)
if (failures > 0) process.exitCode = 1
