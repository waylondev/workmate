# ADR-0003：不启用 server-side-memory，不暴露会话池接口

- **状态**：已接受
- **日期**：2026-10-11

## 背景

AG-UI 官方提供 `agentscope.agui.server-side-memory` 开关，开启后维护内存会话池，
并可暴露会话列表 / 删除接口。

## 决策

1. **不启用** `server-side-memory`（用官方默认值 `false`）。
2. **不暴露**任何「会话池」接口（`/api/sessions` 已删除）。

## 理由

- `HarnessAgent` 自带 EVENT_LOG + `SessionTree` 落盘，再维护一份内存会话池是冗余。
- 暴露一个刻意不启用的组件，会让调用方误以为「会话该从这里读」。

## 后果

- 会话内容的**真相来源**是磁盘转录 JSONL（`SessionTree`），不是任何内存结构。
- 若未来需要服务端会话列表 / 删除，正确做法是读 `SessionTree` 转录 + `sessions.json` 索引。
