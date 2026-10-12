# 贡献指南（CONTRIBUTING）

感谢你考虑为 Workmate 贡献。本项目遵循 Apache-2.0 许可。

## 先读这些

- `AGENTS.md` —— 工程宪法（编程思想、Kotlin/Spring 规范、完成定义）。
- `docs/architecture.md` —— 架构分层与核心原则。
- `docs/roadmap.md` —— 已实现 / 待做的单一真相来源。

## 提交规范

- **Conventional Commits**：`<type>(<scope>): <subject>`，英文小写。
  type 取 `feat` / `fix` / `refactor` / `docs` / `test` / `chore` / `perf` / `build`。
- 一次提交只做一件事；禁止把无关改动混进一个 commit。
- 禁止 push / force push / 改写历史（除非维护者明确授权）。

## 开发流程

1. 从 `docs/roadmap.md` 取一个未完成项（或新建并讨论）。
2. 若需新增依赖，先写 ADR 并在 issue / PR 中说明理由，等待确认。
3. 小步实现，保持每步可编译、可测试、可运行。
4. 真实运行测试，记录命令与结果，禁止虚构。

## 测试

```bash
# 后端
./gradlew test

# 前端
cd frontend && pnpm check:ui && pnpm check:agui && pnpm lint && pnpm build
```

改动涉及后端功能 / 前端交互时，跑一键回归脚本（快速 `bash scripts/regression/run.sh`，完整 `--full`），或按 `docs/regression-checklist.md` 人肉重跑一遍。测试分层与判绿标准见 `docs/testing-guide.md`，能力覆盖台账见 `docs/feature-inventory.md`。

## 完成定义

代码 + 测试 + 文档 + 提交 + 汇报 + 无未批准依赖（详见 `AGENTS.md` §八）。

## 文档一致性

代码改动必须同步 `docs/` 与 `README.md`：新端点、新文件、新机制、漂移修正都要落到文档。
