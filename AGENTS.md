# AGENTS.md — Workmate 工程协作规范

> 本文是仓库的**工程宪法**：任何 AI 或人类协作者改动代码前都必须遵守。
> 与 `docs/` 的分工：本文讲「怎么写代码」，`docs/` 讲「为什么这么设计、边界在哪」。

## 一、项目定位

- **理念：对话即服务（Conversation as a Service）。** 核心交付物是 AG-UI over SSE 的流式对话，
  管理能力（agent / 技能 / 定时任务）是围绕对话的薄层。
- **最小依赖。** 复用 AgentScope 官方能力，禁止为省事引入新库。必须新增依赖 → 先写 ADR 并暂停确认。
- **不引数据库。** 状态存储完全建立在 AgentScope 官方文件型能力（SessionTree / EVENT_LOG）之上。

## 二、编程思想（按优先级）

1. **KISS**：能用简单方案就不引入间接层。先写直白的代码，等真实重复出现再抽象。
2. **YAGNI**：不做「将来可能用得上」的功能。删掉未引用的死代码。
3. **DRY**：同一定义只出现一次。共享类型抽到独立模块（如 `thread-types.ts`），禁止两处并行定义。
4. **SOLID**：
   - 单一职责：控制器只做 HTTP 映射，业务逻辑进 service。
   - 开闭：通过新增适配器扩展，不改既有实现。
   - 里氏替换 / 接口隔离：面向小接口，不面向大而全的接口。
   - 依赖倒置：依赖抽象（端口），不依赖具体实现。
5. **组合优于继承**：用构造函数注入组合能力，不用继承堆功能。
6. **不可变优先**：`val`、`data class`、不可变集合；状态变化通过返回新值而非原地修改。
7. **禁止**：字段注入（`@Autowired` 字段）、`!!` 强制解包、`as?` 之外的裸强转、全局可变状态、滥用 `lateinit`、为模式而模式。

## 三、Kotlin 规范

- 优先 `val`，确需可变才 `var`。
- 数据传输用 `data class`；穷举状态用 `sealed class` / `sealed interface`。
- 空安全：用 `?.`、`?:`、`requireNotNull`；**禁用 `!!`**（除经注释说明且被字节码确证的类型收窄）。
- 异步用协程 / `Flow`；不用裸 `Thread` / `CompletableFuture` 手搓（除非接口强制）。
- 异常清晰：业务语义错误用 `ApiException`（→ RFC 7807），不吞异常、不返回错误哨兵值。

## 四、Spring Boot 规范

- **构造器注入**（Spring 4.1 起无 `@Autowired` 注解也生效）；禁止字段注入。
- 分层：`Controller`（HTTP 映射）→ `Service`（业务）→ 官方能力（不重造）。
- 配置用 `@ConfigurationProperties` + `@ConfigurationPropertiesScan`，配 `data class`。
- 统一异常：`@RestControllerAdvice`（`basePackages` 限定业务包）+ RFC 7807 `ProblemDetail`。
- `@Configuration(proxyBeanMethods = false)` 避免 CGLIB 代理。

## 五、设计模式（按需使用，禁止为模式而模式）

- **端口-适配器（Ports & Adapters）**：领域核心通过「端口」（接口）隔离模型 / 工具 / 存储 / 记忆 / 事件，
  具体技术（Quartz、文件存储、SSE 传输）以「适配器」实现。官方 AgentScope 的 `AgentSkillRepository` /
  `AgentScheduler` 已是端口，本项目只做薄适配层。
- **策略**：可替换算法（如技能删除的归档 vs 硬删仓库选择）用策略而非 if-else 堆叠。
- **工厂**：复杂对象构造（如 `HarnessAgent` 按配置构建）集中到工厂。
- **责任链 / 领域事件 / 模板方法**：仅在确有多个可插拔步骤 / 需要解耦副作用 / 骨架固定时使用。
- 判断标准：**引入模式前先问「没有它会不会更简单」**，会就放弃。

## 六、对话即服务领域模型

核心领域术语（与 `docs/architecture.md` 一致）：

| 概念 | 载体 | 归属 |
|---|---|---|
| **Session** | 一段对话的隔离单元，`threadId` 标识 | AgentScope SessionTree（落盘 JSONL） |
| **Message** | 会话中的一条消息（user / assistant / tool） | 转录 JSONL（append-only） |
| **Turn** | 一轮「用户输入 → agent 响应」 | 由消息序列派生 |
| **ToolCall** | agent 发起的一次工具调用（含 HITL 审批态） | AG-UI `TOOL_CALL_*` 事件 |
| **AgentRuntime** | agent 执行引擎（`HarnessAgent` / 定时 `ReActAgent`） | AgentScope |
| **Policy** | 权限 / 审批策略（`PermissionMode`） | 配置 + 权限引擎 |

**端口隔离**：模型（Model）、工具（Toolkit）、存储（SessionTree）、记忆（Memory）、事件（EVENT_LOG）
各自是独立端口，适配器可替换。业务层只面向端口编程。

## 七、提交规范（Conventional Commits）

- 格式：`<type>(<scope>): <subject>`，英文小写。
- type：`feat` / `fix` / `refactor` / `docs` / `test` / `chore` / `perf` / `build`。
- scope：`backend` / `frontend` / `docs` / 具体模块（`job` / `skill` / `agent`）。
- **禁止**：push / force push / 改写历史（rebase -i、amend 已推送提交、reset --hard）。
- 提交前：只提交源码与文档，排除本机噪声（`.workbuddy/`、`*.log`、`dev/*.html`、硬编码本机路径脚本）。

## 八、完成定义（Definition of Done）

一个优化点「完成」必须同时满足：

1. **代码**：实现落地，通过编译。
2. **测试**：真实运行测试（后端 `./gradlew test`，前端 `pnpm check:ui` / `check:agui` / `lint` / `build`），记录真实命令与结果，**禁止虚构**。
3. **文档**：`docs/` 与 `README.md` 同步更新（新端点、新文件、新机制、漂移修正）。
4. **提交**：Conventional Commits 提交到本地。
5. **汇报**：按「阶段汇报」模板输出变更文件、行为变化、测试结果、风险与下一步。
6. **无未批准依赖**：未新增依赖，或已通过 ADR 确认。

## 九、验证与取证约定

- 后端无法直接跑 Gradle 时，用已构建产物 `java -jar build/libs/*.jar` 联调（见 `docs/architecture.md` 环境节）。
- 调用第三方 jar API 前，用 `javap -p -c` 反编译确认真实签名，禁止凭猜测写 API 名。
- 浏览器自动化（agent-browser）必须**单命令 `&&` 链式**执行（daemon 仅存活于命令期间）。
