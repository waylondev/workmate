# Workmate API 契约

> 业务 REST（`/api/*`）与 AG-UI（`/agui/*`）的权威契约。前端经 Vite 代理访问同一路径。

## 错误契约（统一）

所有 `/api/*` 错误统一返回 RFC 7807 `application/problem+json`：

```json
{ "type": "about:blank", "title": "Not Found", "status": 404,
  "detail": "agent not found: nope", "instance": "/api/jobs" }
```

| 场景 | 状态码 |
|---|---|
| 参数不合法（cron 非法、name 为空） | 400 |
| 资源不存在（未知 agent / 技能 / 任务） | 404 |
| 状态冲突（任务名重复、仓库只读） | 409 |
| 控制器内未预期异常 | 500（细节留服务端日志） |

前端 `api.ts` 的 `ApiError` 取 `detail` 直接展示。

## AG-UI（聊天，SSE）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/agui/run` | agentId 取自 `X-Agent-Id` 头或 `forwardedProps`，兜底 `default-agent-id` |
| POST | `/agui/run/{agentId}` | agentId 取自路径（前端使用的形式） |

事件流见 `README.md` §「验证对话服务」。

## Agent 管理（`/api/agents`）

| 方法 | 路径 | 说明 | 成功 |
|---|---|---|---|
| GET | `/api/agents` | 列表：`id` / `name` / `description` / `registered` / `permission` | 200 |
| DELETE | `/api/agents/{id}` | 注销（可逆，未知 id → 404） | 200 |
| POST | `/api/agents/{id}/register` | 重新注册（未知 id → 404） | 200 |

## 技能管理（`/api/agents/{id}/skills`）

| 方法 | 路径 | 说明 | 成功 |
|---|---|---|---|
| GET | `/api/agents/{id}/skills` | 技能及来源仓库（`repositories` / `writable` / `deletable`） | 200 |
| DELETE | `/api/agents/{id}/skills/{name}` | 删除（**不可逆**）；不存在 404，只读 409 | 200 |

响应 `DELETE` 含 `archived`：true = 官方 `delete()` 内部 move 到 `.archive/`（兜底，**非承诺可恢复**）；false = 硬删除。本项目不提供技能恢复接口。

## 会话管理（`/api/agents/{id}/sessions`）

| 方法 | 路径 | 说明 | 成功 |
|---|---|---|---|
| GET | `/api/agents/{id}/sessions` | 列出该 agent 的全部会话（`sessionId` / `agentName` / `updatedAt`） | 200 |
| DELETE | `/api/agents/{id}/sessions/{sessionId}` | 删除单个会话的**整个落盘目录**（不可逆）；不存在 404，路径穿越 400 | 200 |

`sessionId` 即前端 AG-UI 的 `threadId`，同时是 `{workspace}/{threadId}/` 落盘目录名。删除清掉
该目录下的转录 `.jsonl` 与事件流 `events/`。响应 `DELETE` 含 `removedFiles`（删除的文件数）。

> 官方**没有**会话管理 API（`WorkspaceManager.listSessionLogFiles` 是命名空间相关的，不适合管理面），
> 故本服务直接操作 `config.workspace + threadId` 目录，删除即不可逆。

## 定时任务（`/api/jobs`）

| 方法 | 路径 | 说明 | 成功 |
|---|---|---|---|
| GET | `/api/jobs` | 列表（`id` / `agentId` / `cron` / `executions`） | 200 |
| POST | `/api/jobs` | 创建（`name` / `agentId` / `cronExpression`） | 201 |
| DELETE | `/api/jobs/{name}` | 取消（幂等，`cancelled=false` 表示本不存在） | 200 |

## 端点状态字段语义

- `registered`（agent）：是否在 AG-UI 注册表（可被注销）。
- `deletable`（技能）：是否存在归档仓库或可写仓库。
- `executions`（任务）：已触发次数（官方 `BaseScheduleAgentTask` 计数）。
