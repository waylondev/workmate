# ADR-0004：定时任务用官方 scheduler-quartz，不用 Spring TaskScheduler

- **状态**：已接受
- **日期**：2026-10-11

## 背景

定时任务需要在进程内按 cron 触发 agent。可选 Spring `TaskScheduler` 或官方 Quartz 扩展。

## 决策

**用官方 `agentscope-extensions-scheduler-quartz`**，不用 Spring `TaskScheduler`。

## 理由

1. 官方扩展零 Spring 依赖、栈无关。
2. Quartz cron 表达式语义与前端输入一致。
3. Spring `TaskScheduler` 需自行管理 `ScheduledFuture` 生命周期。

## 后果

- 定时任务每次触发**新建 `ReActAgent`**（官方 `BaseScheduleAgentTask.createAgent()` 语义），
  **不享有 workspace / 记忆 / 技能 / 权限引擎**（见 `design.md` §3.4 边界）。
- 任务定义**不持久化**，进程重启后丢失（官方扩展未提供存储，见 `roadmap.md` P0-1）。
