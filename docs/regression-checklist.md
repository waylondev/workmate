# 回归验证清单（Regression Checklist）

> 改动完成后，按此清单**真实跑一遍**，禁止虚构结果。每一项要么通过（记录证据），要么标失败（附原因）。
> 前置：三端已启动 —— 后端 8080、前端 5173、CPA 8317。启动步骤见 `dev/联调启动说明.md`。

本清单是「可重复执行的验收标准」，与 `docs/verification-report.md`（一次性快照报告）定位不同：那个记录某次验证的完整结果，这个是要你每次改动后重跑的步骤。

## 0. 构建门槛（先过这些，再谈功能）

```bash
# 后端编译（需 JDK 25，见 README「本地开发」）
JAVA_HOME="D:/Users/Administrator/.jdks/jdk-25.0.4.1+1" ./gradlew compileKotlin

# 前端类型 + 构建 + 结构校验 + 审批管线校验 + lint
cd frontend
node node_modules/typescript/bin/tsc --noEmit
node node_modules/npm/bin/npm-cli.js run build
node node_modules/npm/bin/npm-cli.js run check:ui
node node_modules/npm/bin/npm-cli.js run check:agui
node node_modules/npm/bin/npm-cli.js run lint
```

> Windows 下 `npm` / `.bin/vite` 不能用 node 直跑 shell 脚本，统一走 `node node_modules/npm/bin/npm-cli.js run <script>`。

## 1. 三端健康

```bash
# 后端 liveness/readiness
curl -s --noproxy '*' http://localhost:8080/actuator/health
# 前端
curl -s --noproxy '*' -o /dev/null -w "%{http_code}" http://localhost:5173/
# CPA（无 key 返回 401 属正常）
curl -s --noproxy '*' -o /dev/null -w "%{http_code}" http://127.0.0.1:8317/
```

通过标准：health 返回 `{"status":"UP",...}`；前端 200；CPA 200 或 401。

## 2. Agent 管理

```bash
curl -s --noproxy '*' http://localhost:8080/api/agents
```

通过标准：返回 `default` / `coder` / `explorer` 三个，含 `id` / `name` / `registered` / `permission`。

## 3. 定时任务（含执行历史）

```bash
# 建一个每 5 秒触发的任务（用 explorer 只读、执行快）
curl -s --noproxy '*' -X POST http://localhost:8080/api/jobs \
  -H 'Content-Type: application/json' \
  -d '{"name":"regress-smoke","agentId":"explorer","cronExpression":"0/5 * * * * ?"}'

sleep 12   # 等它触发 2 次以上

# 任务列表（executions 计数应 >= 2）
curl -s --noproxy '*' http://localhost:8080/api/jobs

# 执行历史（应返回 >= 2 条，含 status/output/token）
curl -s --noproxy '*' http://localhost:8080/api/jobs/regress-smoke/executions

# 清理
curl -s --noproxy '*' -X DELETE http://localhost:8080/api/jobs/regress-smoke
```

通过标准：`executions` 计数与执行历史条数一致；每条有 `status`、真实 token；取消后历史清空。

## 4. AG-UI SSE 流式对话

```bash
curl -s --noproxy '*' -N -m 60 http://localhost:8080/agui/run/default \
  -H 'Content-Type: application/json' -H 'Accept: text/event-stream' \
  -d '{"threadId":"regress-1","runId":"r1","tools":[],"context":[],"forwardedProps":{},"state":{},"messages":[{"id":"m1","role":"user","content":"你好，用一句话介绍你自己"}]}'
```

通过标准：事件序列含 `RUN_STARTED` → `TEXT_MESSAGE_*` → `CUSTOM(name=token_usage)` → `RUN_FINISHED`；`token_usage` 的 `cumulative` 字段有非零值。

## 5. 子智能体派发（subagent）

```bash
curl -s --noproxy '*' -N -m 90 http://localhost:8080/agui/run/coder \
  -H 'Content-Type: application/json' -H 'Accept: text/event-stream' \
  -d '{"threadId":"regress-sub","runId":"rs","tools":[],"context":[],"forwardedProps":{},"state":{},"messages":[{"id":"m1","role":"user","content":"调用 code-review 子智能体审查 JobController.kt"}]}'
```

通过标准：SSE 里出现 `agent_spawn` 工具调用、参数 `"agent_id":"code-review"`；随后因 `agent_spawn` 是高风险写操作，返回 `interrupt`（`interruptKind=permission_confirm`）回到前端 HITL 审批。**这是正确行为**——`accept-edits` / `explore` 不会自动放行 subagent 派发，见 `design.md` §3.2.1。

## 6. 前端静态校验

`check:ui`（三栏结构 SSR）+ `check:agui`（HITL 审批管线）已在步骤 0 覆盖。若改动涉及 UI，额外确认：

- 深色 / 浅色双主题下，改动区域可读（无白底白字 / 黑底黑字）。
- 交互元素有 `aria-label` 或真实 `<button>`，键盘可 focus。

## 7. 收尾

```bash
# 清理本清单产生的测试会话目录（避免污染 workspace）
rm -rf .agentscope/workspace/*/regress-* 2>/dev/null

# 确认工作区干净、无意外改动
git status --short
```

通过标准：`git status` 只剩本清单明确要求的改动；无 `regress-*` 残留。

---

## 判定

- **全绿**：上述 0–6 项全部通过，可提交。
- **有失败**：记录失败项 + 实际输出 + 根因，**禁止把「跑不过」写成「通过」**。失败项要么修复后重跑，要么在提交信息里明确标注「已知未覆盖」。
