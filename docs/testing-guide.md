# 自动化测试指南（Testing Guide）

> 本文是 workmate 的**测试执行手册**：说明有哪些自动化测试、怎么跑、判绿标准是什么、什么时候跑哪一层。
> 与 `regression-checklist.md`（人肉验收清单）和 `scripts/regression/run.sh`（一键回归脚本）配套，三者覆盖同一套能力、从不同角度验证。

---

## 一、测试金字塔

workmate 的自动化测试分三层，从下往上成本递增、越接近真实用户：

```
        ┌─────────────────────────────┐
        │ L3 端到端回归（run.sh --full）│ ← 真实三端 + 真实模型
        ├─────────────────────────────┤
        │ L2 前端静态校验（check:ui/agui）│ ← 无后端，SSE 重放
        ├─────────────────────────────┤
        │ L1 后端单元测试（JUnit）       │ ← 纯逻辑，毫秒级
        └─────────────────────────────┘
```

| 层 | 覆盖 | 依赖真实后端？ | 依赖真实模型？ | 速度 |
|---|---|---|---|---|
| L1 单元测试 | JobDefinitionStore 落盘逻辑 | 否 | 否 | 毫秒 |
| L2 前端静态 | 三栏结构 / HITL 审批管线 | 否（SSE 重放） | 否 | 秒 |
| L3 端到端回归 | 全部 REST 端点 + AG-UI SSE + cron + subagent | 是 | `--full` 时是 | 分钟 |

---

## 二、L1 — 后端单元测试

### 命令

```bash
JAVA_HOME="D:/Users/Administrator/.jdks/jdk-25.0.4.1+1" ./gradlew test
```

### 现有用例

| 测试类 | 覆盖 |
|---|---|
| `JobDefinitionStoreTest` | 定义落盘 round-trip / 文件缺失返回空 / 文件损坏返回空 |
| `WorkmateApplicationTests` | Spring 上下文加载（冒烟） |

### 判绿标准

`gradlew test` 退出码 0；`build/reports/tests` 下无失败用例。

### 何时跑

- 改动 `job/` 包（JobDefinitionStore / JobExecutionStore）后必跑。
- 提交前作为编译门槛的一部分。

---

## 三、L2 — 前端静态校验

### 命令

```bash
cd frontend
npm run check:ui     # 三栏结构 SSR 校验（scripts/ui-check.tsx）
npm run check:agui   # HITL 审批管线校验（scripts/agui-pipeline-check.ts）
npm run lint         # oxlint
npx tsc --noEmit     # 类型检查
```

### 说明

- `check:ui`：把三栏组件做 SSR 构建后断言关键结构（侧栏/中栏/摘要面板顺序、技能 chip、步骤数=工具调用数、状态判定、参数摘要）。
- `check:agui`：把真实抓取的 SSE 字节用本地 HTTP 服务重放，让真正的 `HttpAgent` 走与页面相同的 fetch 包装，验证 `expiresAt:null` 的中断能完整抵达 UI（Z1–Z16）。**不依赖后端**。

### 判绿标准

两个 check 均打印「全部通过」且 `FAIL=0`；`tsc --noEmit` 与 `lint` 无输出错误。

### 何时跑

- 改动 `frontend/src/**` 后必跑。
- 改动 `@/agui-sse` / `@/agui-errors` 后必跑 `check:agui`（这是该脚本守护的核心逻辑）。

---

## 四、L3 — 端到端回归脚本

### 命令

```bash
# 快速（不碰模型）：健康检查 + REST 端点 + 前端静态
bash scripts/regression/run.sh

# 全量（含模型）：额外跑 cron 真实触发 / AG-UI 对话 / subagent 派发
bash scripts/regression/run.sh --full
```

### 前置

三端已启动（后端 8080 / 前端 5173 / CPA 8317），见 `dev/联调启动说明.md`。

### 覆盖矩阵

| 步骤 | 检查项 | 快速 | --full |
|---|---|---|---|
| 0 构建门槛 | 构建脚本存在 | ✅ | ✅ |
| 1 三端健康 | health=UP / 前端 200 / CPA 可达 | ✅ | ✅ |
| 2 Agent 管理 | 列表 + 注销/重注册可逆 | ✅ | ✅ |
| 3 定时任务 | 创建 / 触发 / 执行历史 / 取消 | ⏭ | ✅ |
| 4 AG-UI SSE | RUN_STARTED→TEXT→token_usage→FINISHED | ⏭ | ✅ |
| 5 subagent | agent_spawn + permission_confirm | ⏭ | ✅ |
| 6 前端静态 | check:ui + check:agui | ✅ | ✅ |
| 7 收尾 | 清理测试会话 + git 无意外改动 | ✅ | ✅ |

### 判绿标准

退出码 0（`PASS N | FAIL 0`）。快速模式下 SKIP 是预期，不是失败。

### 环境变量覆盖

```bash
BACKEND_URL=http://localhost:8080 \
FRONTEND_URL=http://localhost:5173 \
CPA_URL=http://127.0.0.1:8317 \
bash scripts/regression/run.sh --full
```

---

## 五、何时跑什么（决策表）

| 场景 | 最小必跑 | 建议 |
|---|---|---|
| 改 `job/` 包 | L1 `gradlew test` | L3 `--full`（cron 链路） |
| 改 `frontend/src/**` | L2 三个命令 | L3 快速 |
| 改 `@/agui-sse` 或 `@/agui-errors` | L2 `check:agui` | L3 快速 |
| 改 Controller / 端点契约 | — | L3 `--full` |
| 提交前 | L1 + L2 | L3 快速 |
| 发版 / 完整验收 | 全部 | L3 `--full` |

---

## 六、常见坑（本机实测）

1. **`--noproxy '*'` 的星号不能放进变量再展开**——会被 shell 做 glob 展开成文件名，curl 误判 host 走代理（302）。必须直接内联进函数。
2. **不要用 `node node_modules/npm/bin/npm-cli.js run <script>`**——本机 node 22 内嵌 npm，没有独立 `npm-cli.js`，会 `MODULE_NOT_FOUND`。直接 `npm run <script>`。
3. **Git Bash 缺 coreutils**：跑脚本前 `export PATH="/d/Program Files/Git/usr/bin:$PATH"`。
4. **CPA 未授权时 `--full` 会 FAIL**（而非静默跳过）——这是刻意设计，确保不会把「账号没绑」当「测试通过」。
