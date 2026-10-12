# Workmate 前端 UI 规范

> 本文是前端视觉/交互的**唯一权威**：怎么做「科技感 + 高级感」，令牌在哪、组件怎么复用、
> 哪些坑不能踩。与 `AGENTS.md` 的分工：AGENTS.md 讲「怎么写前端代码」，本文讲「写成什么样」。

## 一、设计语言

- **关键词**：科技感、克制、高级、层次。宁可少而精，不做廉价彩虹渐变与过度动画。
- **科技感来源**（不是靠堆特效）：
  1. 深色基底（近黑蓝）+ 冷色/霓虹品牌渐变（cyan → violet）。
  2. 玻璃拟态（半透明 + `backdrop-blur`）分层。
  3. 细网格底纹 + 径向环境光晕（`body::before` 与 `body` 背景）。
  4. 发光边框 / 品牌光晕阴影（克制，只用于品牌元素与焦点态）。
- **高级感来源**：
  1. 留白与字体层级清晰（标题 / 正文 / 辅助三级）。
  2. 圆角、间距、阴影**统一**，全部走令牌，禁止散落的 magic number。
  3. 细节一致：同一类元素（图标按钮、chip、卡片）在全局长得一样。

## 二、设计令牌（唯一来源：`frontend/src/index.css`）

所有视觉值集中在 `index.css` 的两层：

- **`:root` / `.dark`**：语义色（`--background` / `--foreground` / `--primary` / `--muted` …）
  与品牌色（`--brand-cyan` / `--brand-violet` / `--brand-glow`）。shadcn 组件引用语义 token，
  因此**只改这里即可全局换肤**。
- **`@theme`**：把语义 token 映射成 Tailwind 工具类（`--color-*` / `--radius-*`），并补充
  **品牌光晕阴影令牌**：

  | 令牌 | 用途 |
  |---|---|
  | `--shadow-glow-sm` / `md` / `lg` | 品牌图标三级发光（小/中/大） |
  | `--shadow-float` | 卡片悬浮阴影 |
  | `--shadow-inset-primary` | 选中态内描边（侧栏 active 项 / chip），用 inset ring 避免布局抖动 |

**铁律**：新增视觉值一律进令牌，禁止在组件里写 `shadow-[0_0_…]`、`bg-[#…]` 等 magic string；
确需一次性取值用 `color-mix(in oklab, …)` 引用既有令牌。

## 三、复用优先（不新增依赖）

- 图标：`lucide-react`（已在 `package.json`）。
- 动画：Tailwind `animate-in` / `tw-shimmer` / `motion-reduce` 工具类，不引 framer-motion。
- 组件：优先 `assistant-ui` 官方 primitive + 项目内 `ui/`（`Button` / `Skeleton` / `Textarea` /
  `Tooltip`）+ `TooltipIconButton` + `surfaces.tsx` 的 `pressable` / `ghostButton` 等工具类。
- **任何新依赖必须先写 ADR（`docs/adr/`）并暂停确认**，见 `AGENTS.md` §一。

## 四、交互与无障碍底线

1. 所有动画必须带 `motion-reduce:animate-none`（尊重 `prefers-reduced-motion`）。
2. 图标按钮必须有 `aria-label`（`TooltipIconButton` 已内置，直接用）。
3. 键盘可达：可交互元素用真实 `<button>`，焦点态用 `focus-visible:ring-*`。
4. 深色 / 浅色双主题都可用（`.dark` 类切换，`ThemeToggle` 控制），改视觉时两套都要检查。
5. 桌面端优先：单机内部工具，不做移动端响应式适配（见 `roadmap.md` N-8）。

## 五、已落地的关键视觉资产

- **玻璃面板**：`.glass`（`index.css`）——`backdrop-blur(16px) saturate(140%)`，侧栏/右栏/顶栏复用。
- **品牌渐变**：`.text-gradient`（文字）、`.btn-brand`（按钮/图标底）。
- **细滚动条**：全局统一，透明轨道 + 圆角 thumb，深色下掺品牌 cyan 微光（`index.css`）。
- **输入区焦点态**：品牌 cyan 边框 + 柔和 violet 外圈光晕（`thread.aui.tsx` Composer / EditComposer）。
- **欢迎页空态**：品牌图标 + 径向光晕 + 渐变分隔线 + 三级字体层级（`App.tsx` Welcome）。
