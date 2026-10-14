// 键盘快捷键的共享定义。
//
// 帮助面板的展示与实际按键处理共用这一份「按键 → 语义」映射，避免两处漂移。
// 单键快捷键（J/K/A/R）必须配合「非输入框」守卫使用，见 isEditableTarget。

/** 判定焦点是否落在可编辑元素上（输入框 / 文本域 / 富文本），用于屏蔽单键快捷键。 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  if (tag === "input" || tag === "textarea" || tag === "select") return true
  return target.isContentEditable
}

export type ShortcutItem = {
  /** 依次渲染成 kbd 徽标（单个字符串 = 一个徽标）。 */
  keys: string[]
  label: string
  description: string
}

/** 快捷键目录：帮助面板按此顺序渲染。 */
export const SHORTCUTS: ShortcutItem[] = [
  {
    keys: ["Ctrl/⌘ K"],
    label: "命令面板",
    description: "搜索并执行：新建对话、切换 Agent、导航",
  },
  {
    keys: ["J", "K"],
    label: "移动会话高亮",
    description: "在「最近」会话列表中上下移动",
  },
  {
    keys: ["Enter"],
    label: "打开会话",
    description: "打开当前高亮的会话",
  },
  {
    keys: ["A"],
    label: "批准授权",
    description: "允许当前第一个待授权工具",
  },
  {
    keys: ["R"],
    label: "拒绝授权",
    description: "拒绝当前第一个待授权工具",
  },
  {
    keys: ["?"],
    label: "快捷键帮助",
    description: "打开 / 关闭本帮助面板",
  },
  {
    keys: ["Esc"],
    label: "关闭面板",
    description: "关闭命令面板或帮助面板",
  },
]
