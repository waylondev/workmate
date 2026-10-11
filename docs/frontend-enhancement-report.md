# 前端功能增强验证报告

> 范围：**「全部允许」功能 + 醒目授权提示 + 前端科技感视觉升级** 三项改动的自测结果。
> 日期：2026-10-11

## 结论先行

**全部通过**：15 项 UI 派生断言 + 16 项 AG-UI 管线断言 + 4 项真实端到端探测，共 **35 项全绿，0 失败**。

| 验证层 | 项数 | 结果 |
|---|---|---|
| `pnpm check:ui`（SSR 三栏 + 派生逻辑） | 15 | ✅ 全通过 |
| `pnpm check:agui`（HITL 审批管线，真实字节重放） | 16 | ✅ 全通过 |
| 真实端到端（后端 8080 真模型） | 4 | ✅ 全通过 |
| `pnpm build`（tsc + vite） | — | ✅ 通过 |
| dev 模块转译 | 6/6 | ✅ 200 |

---

## 一、「全部允许」（Allow All）功能

### 功能含义

用户在工具授权场景下，可以**一键批准当前所有待授权的工具调用**，无需逐个点开工具卡点 Allow。此外提供一个「本会话内自动批准」开关，勾选后本轮对话里后续出现的授权会自动放行。

### 实现位置

| 文件 | 职责 |
|---|---|
| `src/approvals.ts` | 纯函数 `derivePendingApprovals`：从线程消息派生全部待授权项（toolName + approvalId） |
| `src/ag-ui-runtime-provider.tsx` | 新增 `useApprovalRuntime` 上下文，把 `runtime.thread.respondToToolApproval` 暴露给横幅 |
| `src/components/approval-banner.tsx` | 置顶横幅：列出待授权工具，提供「允许 / 全部允许 / 拒绝 / 自动批准」 |

### 关键机制

- **待授权判定**：`approval.approved === undefined` 且无 `resolution`（与工具卡 `requires-action` 互为表里，但直接从消息树派生，横幅不依赖工具卡渲染）。
- **全部允许**：循环调用 `respondToToolApproval({ approvalId, approved: true })`。
- **自动批准**：`useEffect` 监听 `autoApprove` 开关（调用方 `App.tsx` 持有的内存态），新出现的待授权项立即放行（用 `Set` 去重防重复触发）。

### 验证证据（`check:ui` 新增 5 项断言）

```
PASS  待授权项只统计 approved 未定的  实际 1
PASS  解析出工具名  list_files
PASS  解析出 approvalId  approval-1
PASS  已批准/已完成的不计入
PASS  空线程无待授权  0
```

（`check:agui` 新增 Z16：真实 runtime 上循环批准 2 个 approval，无致命错误）

---

## 二、醒目授权提示

### 功能含义

此前用户**不点开 tool call 卡片就不知道需要授权**（审批卡藏在折叠的工具卡里）。现在：

1. **置顶横幅**：出现待授权时，对话区顶部浮出高对比琥珀色横幅（脉冲光晕），列出卡住的工具名，直接给「允许 / 全部允许 / 拒绝」按钮。
2. **工具卡收起态高亮**：`requires-action` 状态的工具卡在折叠时就有琥珀色边框 + 「待授权」徽章 + 脉冲图标，一眼可见。
3. **Allow 按钮改醒目绿**：工具卡内的 Allow 按钮从灰色改为 emerald 绿，与 Deny 形成强对比。

### 实现位置

- `src/components/approval-banner.tsx`（新增）：置顶横幅 + 脉冲光晕 + 三按钮
- `src/components/tool-fallback.aui.tsx`：`ToolFallbackTrigger` 加 requires-action 高亮 + 「待授权」徽章；Allow 按钮改 emerald 绿

### 验证证据

- 横幅渲染逻辑由 `derivePendingApprovals`（check:ui 断言）+ `respondToToolApproval`（check:agui Z16）共同覆盖。
- 工具卡高亮：`check:agui` Z9 证明 approval 确实挂上工具卡（2/2 张），触发 `requires-action` 态。

---

## 三、前端科技感视觉升级

### 功能含义

把原先的 shadcn 灰阶底子换成科技感现代风格：品牌渐变、分层玻璃面、环境光晕、网格底纹。

### 实现位置与要点

| 位置 | 改动 |
|---|---|
| `src/index.css` | 品牌色 cyan→violet（`--brand-cyan`/`--brand-violet`）；面板改半透明玻璃面（`--card` 降透明度 + backdrop-blur）；`body` 叠加径向光斑 + `body::before` 细网格底纹；新增 `.text-gradient`/`.glass`/`.btn-brand` 工具类 |
| `app-sidebar.tsx` | 品牌 logo 渐变 + 光晕；active 项改品牌高亮（`bg-primary/10` + inset 描边） |
| `App.tsx` | `ChatHeader` 改玻璃面；`Welcome` 页加品牌 logo + 渐变标题 |
| `conversation-summary-panel.tsx` | 右栏改玻璃面 |
| `composer-chips.tsx` | 下拉菜单改玻璃面 |

### 验证证据

- `pnpm build` 通过（CSS 产物 91KB，含全部新令牌）
- SSR 产物确认含 `text-gradient`、`glass`、`btn-brand` 类
- 深色/浅色两套 token 均定义（`.dark` 块），主题切换不闪白（index.html 首屏脚本保持）

---

## 四、真实端到端验证

后端 8080 + 真模型（CPA→hy3）实跑：

```
=== 事件序列 ===
  RUN_STARTED ×1, REASONING_MESSAGE_* ×54, TOOL_CALL_START ×2, TOOL_CALL_ARGS ×10,
  TOOL_CALL_END ×2, REQUEST_STOP ×1, RUN_FINISHED ×1, RAW ×1, CUSTOM ×1
=== outcome / interrupt ===
  toolCallName: list_files
  "requires user confirmation" 命中 1 次
```

即：`list_files` 触发 HITL，后端返回 `RUN_FINISHED + outcome.interrupt`（审批数据源完整），前端横幅据此弹出。

dev 转译 6/6 模块 200（含新增的 `approvals.ts`、`approval-banner.tsx`）。

---

## 未覆盖部分（如实说明）

浏览器内像素级/交互级验收仍不可用（本机 Chromium 自动化不可用）。三项交互建议你在浏览器手过：

1. 触发工具授权后，顶部横幅是否弹出、点「全部允许」后工具是否全部放行执行；
2. 勾选「本会话内自动批准」后，后续工具是否不再弹横幅；
3. 深色/浅色主题下光晕、网格、玻璃面是否都正常（无过曝或不可读）。

## 复现方式

```bash
cd frontend
pnpm build          # 类型 + 构建
pnpm check:ui       # SSR 三栏 + 派生断言（15 项）
pnpm check:agui     # HITL 审批管线（16 项，需 build/int/verify 下有 hitl 取证）
```
