#!/usr/bin/env bash
#
# workmate 一键回归脚本 —— 把 docs/regression-checklist.md 的 0–6 步自动化。
#
# 用法：
#   bash scripts/regression/run.sh            # 快速回归：只跑不依赖真实模型的瞬时检查
#   bash scripts/regression/run.sh --full     # 全量：额外跑 AG-UI 对话 / subagent / cron 真实触发
#   bash scripts/regression/run.sh --help
#
# 前置（同 regression-checklist）：后端 8080、前端 5173、CPA 8317 已启动。
# 说明：
#   - 默认 SKIP 所有「会打到 CPA→hy3 模型」的慢步骤，保证无账号授权也能瞬时判绿。
#   - --full 才跑模型调用；CPA 未授权时这些步骤会如实 FAIL（而非静默跳过）。
#   - 退出码：0=全绿；1=存在失败；2=前置环境未就绪。
#
# 依赖：curl。Windows 下需 Git Bash（coreutils 齐全的 PATH）。

set -u

# ---- 可配置项（用环境变量覆盖）----
BACKEND_URL="${BACKEND_URL:-http://localhost:8080}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:5173}"
CPA_URL="${CPA_URL:-http://127.0.0.1:8317}"
FULL=0

# ---- 通用工具 ----
# 注意：`--noproxy '*'` 的星号必须直接内联到函数里（加引号），
# 不能放进变量再展开——否则 shell 会把 `*` 做 glob 展开成文件名，curl 误判 host 走代理。
PASS=0
FAIL=0
SKIP=0
declare -a FAILED_STEPS=()

CURL() { curl -s --noproxy '*' "$@"; }

step()  { printf '\n\033[1;36m== %s ==\033[0m\n' "$1"; }
check() { # check <label> <ok(0/1)> [extra]
  if [ "$2" -eq 1 ]; then
    printf '  \033[32mPASS\033[0m  %s\n' "$1"; PASS=$((PASS+1));
  else
    printf '  \033[31mFAIL\033[0m  %s\n' "$1"; FAIL=$((FAIL+1)); FAILED_STEPS+=("$1");
    [ -n "${3:-}" ] && printf '         %s\n' "$3";
  fi
}
skipped() { printf '  \033[33mSKIP\033[0m  %s\n' "$1"; SKIP=$((SKIP+1)); }

# json 字段取值（无 jq，用 grep/sed 近似；值不含嵌套时可靠）
json_get() { # json_get <json> <key>  → 返回第一个 "key":<value>（不含引号嵌套）
  printf '%s' "$1" | sed -n "s/.*\"$2\"[[:space:]]*:[[:space:]]*\"\{0,1\}\([^\",}]*\)\"\{0,1\}.*/\1/p" | head -n1
}

# ---- 参数解析 ----
for arg in "$@"; do
  case "$arg" in
    --full) FULL=1 ;;
    -h|--help)
      sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) printf '未知参数: %s（见 --help）\n' "$arg" >&2; exit 2 ;;
  esac
done

printf '\033[1mworkmate 回归 — %s\033[0m\n' "$([ "$FULL" -eq 1 ] && echo '全量(--full)' || echo '快速(默认)')"
printf '  后端 %s | 前端 %s | CPA %s\n\n' "$BACKEND_URL" "$FRONTEND_URL" "$CPA_URL"

# =====================================================================
step "0. 构建门槛"
# =====================================================================
# 编译太重、且通常已在提交前跑过；这里只做「门槛探测」：源码存在即可，
# 真正的编译/类型/lint 交给 testing-guide 里显式执行（回归聚焦运行态）。

if [ -f build.gradle.kts ]; then
  check "后端构建脚本存在 (build.gradle.kts)" 1
else
  check "后端构建脚本存在 (build.gradle.kts)" 0
fi
if [ -f frontend/package.json ]; then
  check "前端清单存在 (frontend/package.json)" 1
else
  check "前端清单存在 (frontend/package.json)" 0
fi

# =====================================================================
step "1. 三端健康"
# =====================================================================
HEALTH="$(CURL "$BACKEND_URL/actuator/health" 2>/dev/null)"
check "后端 /actuator/health 返回 UP" \
  "$( [ -n "$HEALTH" ] && printf '%s' "$HEALTH" | grep -q '"UP"' && echo 1 || echo 0 )" \
  "health=$HEALTH"

FE_HTTP="$(CURL -o /dev/null -w '%{http_code}' "$FRONTEND_URL/" 2>/dev/null)"
check "前端 5173 返回 200" \
  "$( [ "$FE_HTTP" = "200" ] && echo 1 || echo 0 )" "http=$FE_HTTP"

CPA_HTTP="$(CURL -o /dev/null -w '%{http_code}' "$CPA_URL/" 2>/dev/null)"
case "$CPA_HTTP" in 200|401) CPA_OK=1 ;; *) CPA_OK=0 ;; esac
check "CPA 8317 可达 (200/401)" "$CPA_OK" "http=$CPA_HTTP"

# 后端不可达 → 后续业务检查无意义，直接判「环境未就绪」退出
if ! printf '%s' "$HEALTH" | grep -q '"UP"'; then
  printf '\n\033[31m后端未就绪，业务检查无法进行。请先启动后端（见 dev/联调启动说明.md）。\033[0m\n'
  exit 2
fi

# =====================================================================
step "2. Agent 管理"
# =====================================================================
AGENTS="$(CURL "$BACKEND_URL/api/agents" 2>/dev/null)"
check "GET /api/agents 返回 default/coder/explorer" \
  "$( for a in default coder explorer; do printf '%s' "$AGENTS" | grep -q "\"$a\"" || { echo 0; exit; }; done; echo 1 )" \
  "agents=$AGENTS"

check "每个 agent 含 registered 字段" \
  "$( printf '%s' "$AGENTS" | grep -q '"registered"' && echo 1 || echo 0 )"

# 注销/重注册 可逆性（用 explorer，避免影响 default 当前会话）
UNREG="$(CURL -X DELETE "$BACKEND_URL/api/agents/explorer" 2>/dev/null)"
check "DELETE /api/agents/explorer 返回 registered=false" \
  "$( printf '%s' "$UNREG" | grep -q '"registered":false' && echo 1 || echo 0 )" "resp=$UNREG"
REG="$(CURL -X POST "$BACKEND_URL/api/agents/explorer/register" 2>/dev/null)"
check "POST .../register 恢复 registered=true" \
  "$( printf '%s' "$REG" | grep -q '"registered":true' && echo 1 || echo 0 )" "resp=$REG"

# =====================================================================
step "2b. 技能管理"
# =====================================================================
SK_LIST_HTTP="$(CURL -o /dev/null -w '%{http_code}' "$BACKEND_URL/api/agents/default/skills" 2>/dev/null)"
check "GET /api/agents/default/skills → 200" \
  "$( [ "$SK_LIST_HTTP" = "200" ] && echo 1 || echo 0 )" "code=$SK_LIST_HTTP"
SK_LIST="$(CURL "$BACKEND_URL/api/agents/default/skills" 2>/dev/null)"
check "GET /api/agents/default/skills 返回技能列表" \
  "$( [ -n "$SK_LIST" ] && echo 1 || echo 0 )"

SK_404="$(CURL -o /dev/null -w '%{http_code}' "$BACKEND_URL/api/agents/nope/skills" 2>/dev/null)"
check "GET /api/agents/nope/skills → 404（agent 不存在）" \
  "$( [ "$SK_404" = "404" ] && echo 1 || echo 0 )" "code=$SK_404"

SK_DEL_404="$(CURL -o /dev/null -w '%{http_code}' -X DELETE "$BACKEND_URL/api/agents/default/skills/__nope__" 2>/dev/null)"
check "DELETE /api/agents/default/skills/__nope__ → 404（技能不存在）" \
  "$( [ "$SK_DEL_404" = "404" ] && echo 1 || echo 0 )" "code=$SK_DEL_404"

# =====================================================================
step "3. 定时任务（含执行历史）"
# =====================================================================
# 参数校验分支（不依赖模型，常驻快速回归）
JOB_400="$(CURL -o /dev/null -w '%{http_code}' -X POST "$BACKEND_URL/api/jobs" \
  -H 'Content-Type: application/json' -d '{}' 2>/dev/null)"
check "POST /api/jobs 缺字段 {} → 400" \
  "$( [ "$JOB_400" = "400" ] && echo 1 || echo 0 )" "code=$JOB_400"

if [ "$FULL" -eq 1 ]; then
  JOB_NAME="regress-smoke"
  CREATE="$(CURL -X POST "$BACKEND_URL/api/jobs" \
    -H 'Content-Type: application/json' \
    -d "{\"name\":\"$JOB_NAME\",\"agentId\":\"explorer\",\"cronExpression\":\"0/5 * * * * ?\"}" 2>/dev/null)"
  check "POST /api/jobs 创建任务" \
    "$( printf '%s' "$CREATE" | grep -q "\"name\":\"$JOB_NAME\"" && echo 1 || echo 0 )" "resp=$CREATE"

  printf '        等待 12s 触发 ≥2 次…\n'
  sleep 12

  JOBS="$(CURL "$BACKEND_URL/api/jobs" 2>/dev/null)"
  check "GET /api/jobs 含 $JOB_NAME 且 executions≥2" \
    "$( printf '%s' "$JOBS" | grep -q "\"name\":\"$JOB_NAME\"" && echo 1 || echo 0 )" "jobs=$JOBS"

  EXECS="$(CURL "$BACKEND_URL/api/jobs/$JOB_NAME/executions" 2>/dev/null)"
  EXEC_CNT="$(printf '%s' "$EXECS" | grep -o '"status"' | wc -l | tr -d ' ')"
  check "GET .../executions 返回 ≥2 条" \
    "$( [ "$EXEC_CNT" -ge 2 ] 2>/dev/null && echo 1 || echo 0 )" "count=$EXEC_CNT"
  check "执行记录含 success 状态与真实 token" \
    "$( printf '%s' "$EXECS" | grep -q '"status":"success"' && printf '%s' "$EXECS" | grep -q '"outputTokens"' && echo 1 || echo 0 )"

  CANCEL="$(CURL -X DELETE "$BACKEND_URL/api/jobs/$JOB_NAME" 2>/dev/null)"
  check "DELETE /api/jobs 取消任务" \
    "$( printf '%s' "$CANCEL" | grep -q '"cancelled":true' && echo 1 || echo 0 )" "resp=$CANCEL"
else
  skipped "cron 真实触发（需 --full）"
fi

# =====================================================================
step "4. AG-UI SSE 流式对话"
# =====================================================================
if [ "$FULL" -eq 1 ]; then
  # 注意：SSE 是流式输出，不能用 $(...) 命令替换捕获——那会在流中间态被截断（实测只拿到 666B）。
  # 必须落盘到文件、curl 跑完后再读文件判断。
  mkdir -p build/int
  SSE_FILE="build/int/regress-sse.txt"
  SSE_TID="regress-sse-$$-$(date +%s)"
  CURL -N -m 90 "$BACKEND_URL/agui/run/default" \
    -H 'Content-Type: application/json' -H 'Accept: text/event-stream' \
    -d "{\"threadId\":\"$SSE_TID\",\"runId\":\"r1\",\"tools\":[],\"context\":[],\"forwardedProps\":{},\"state\":{},\"messages\":[{\"id\":\"m1\",\"role\":\"user\",\"content\":\"你好，用一句话介绍你自己\"}]}" \
    > "$SSE_FILE" 2>/dev/null
  SSE="$(cat "$SSE_FILE" 2>/dev/null)"
  check "SSE 含 RUN_STARTED" "$( printf '%s' "$SSE" | grep -q 'RUN_STARTED' && echo 1 || echo 0 )"
  check "SSE 含 TEXT_MESSAGE" "$( printf '%s' "$SSE" | grep -q 'TEXT_MESSAGE' && echo 1 || echo 0 )"
  check "SSE 含 token_usage" "$( printf '%s' "$SSE" | grep -q 'token_usage' && echo 1 || echo 0 )"
  check "SSE 含 RUN_FINISHED" "$( printf '%s' "$SSE" | grep -q 'RUN_FINISHED' && echo 1 || echo 0 )"
else
  skipped "AG-UI SSE 对话（需 --full）"
fi

# =====================================================================
step "4b. 会话管理（列出 / 删除）"
# =====================================================================
if [ "$FULL" -eq 1 ]; then
  # 造一个真实会话：用 default agent 跑一次 AG-UI，落盘 workspace/{threadId}
  SESS_TID="regress-sess-$$-$(date +%s)"
  CURL -N -m 60 "$BACKEND_URL/agui/run/default" \
    -H 'Content-Type: application/json' -H 'Accept: text/event-stream' \
    -d "{\"threadId\":\"$SESS_TID\",\"runId\":\"rs\",\"tools\":[],\"context\":[],\"forwardedProps\":{},\"state\":{},\"messages\":[{\"id\":\"m1\",\"role\":\"user\",\"content\":\"ping\"}]}" \
    > /dev/null 2>&1
  sleep 3
  SESS_LIST="$(CURL "$BACKEND_URL/api/agents/default/sessions" 2>/dev/null)"
  check "GET /api/agents/default/sessions 返回会话列表" \
    "$( printf '%s' "$SESS_LIST" | grep -q 'sessionId' && echo 1 || echo 0 )"
  SID="$(printf '%s' "$SESS_LIST" | grep -oP '"sessionId":"\K[^"]+' | head -n1)"
  if [ -n "$SID" ]; then
    SDEL="$(CURL -X DELETE "$BACKEND_URL/api/agents/default/sessions/$SID" 2>/dev/null)"
    check "DELETE /api/agents/default/sessions/{sid} → deleted=true" \
      "$( printf '%s' "$SDEL" | grep -q '"deleted":true' && echo 1 || echo 0 )" "resp=$SDEL"
  else
    check "DELETE session（无会话可删，跳过）" 1
  fi
  S404="$(CURL -o /dev/null -w '%{http_code}' "$BACKEND_URL/api/agents/nope/sessions" 2>/dev/null)"
  check "GET /api/agents/nope/sessions → 404" \
    "$( [ "$S404" = "404" ] && echo 1 || echo 0 )" "code=$S404"
  SDEL404="$(CURL -o /dev/null -w '%{http_code}' -X DELETE "$BACKEND_URL/api/agents/default/sessions/regress-missing" 2>/dev/null)"
  check "DELETE 不存在会话 → 404" \
    "$( [ "$SDEL404" = "404" ] && echo 1 || echo 0 )" "code=$SDEL404"
  # 路径穿越防御：应被拒（非 200）
  STRAV="$(CURL -o /dev/null -w '%{http_code}' --path-as-is -X DELETE "$BACKEND_URL/api/agents/default/sessions/..%2F.." 2>/dev/null)"
  check "DELETE 路径穿越被拒（非 200）" \
    "$( [ "$STRAV" != "200" ] && echo 1 || echo 0 )" "code=$STRAV"
else
  skipped "会话管理（需 --full）"
fi

# =====================================================================
step "5. 子智能体派发（subagent）"
# =====================================================================
if [ "$FULL" -eq 1 ]; then
  mkdir -p build/int
  SUB_FILE="build/int/regress-sub.txt"
  # threadId 必须每次全新：subagent 会触发 permission_confirm 中断，若复用旧 thread 会残留
  # 未决中断，后端直接 RUN_ERROR("unresolved interrupts")——回归脚本不响应审批，故必须随机化。
  SUB_TID="regress-sub-$$-$(date +%s)"
  CURL -N -m 180 "$BACKEND_URL/agui/run/coder" \
    -H 'Content-Type: application/json' -H 'Accept: text/event-stream' \
    -d "{\"threadId\":\"$SUB_TID\",\"runId\":\"rs\",\"tools\":[],\"context\":[],\"forwardedProps\":{},\"state\":{},\"messages\":[{\"id\":\"m1\",\"role\":\"user\",\"content\":\"调用 code-review 子智能体审查 JobController.kt\"}]}" \
    > "$SUB_FILE" 2>/dev/null
  SUB="$(cat "$SUB_FILE" 2>/dev/null)"
  check "SSE 含 agent_spawn 工具调用" \
    "$( printf '%s' "$SUB" | grep -q 'agent_spawn' && echo 1 || echo 0 )"
  check "SSE 含 permission_confirm 中断（HITL）" \
    "$( printf '%s' "$SUB" | grep -q 'permission_confirm' && echo 1 || echo 0 )" \
    "预期：agent_spawn 为高风险写操作，被权限引擎拦为审批"
else
  skipped "subagent 派发（需 --full）"
fi

# =====================================================================
step "6. 前端静态校验（check:ui / check:agui）"
# =====================================================================
if [ -d frontend/node_modules ]; then
  # 直接 `npm run <script>`：npm 是 PATH 里可执行脚本，无需 node 包装 npm-cli.js
  # （后者在本机 node 22 内嵌 npm 下不存在，会导致 MODULE_NOT_FOUND）。
  UI_OUT="$(cd frontend && npm run check:ui 2>&1)"; UI_RC=$?
  check "check:ui 全过 (FAIL=0)" "$( [ "$UI_RC" -eq 0 ] && echo 1 || echo 0 )" \
    "$(printf '%s' "$UI_OUT" | tail -n3 | tr '\n' ' ')"

  AGUI_OUT="$(cd frontend && npm run check:agui 2>&1)"; AGUI_RC=$?
  check "check:agui 全过 (FAIL=0)" "$( [ "$AGUI_RC" -eq 0 ] && echo 1 || echo 0 )" \
    "$(printf '%s' "$AGUI_OUT" | tail -n3 | tr '\n' ' ')"
else
  skipped "前端静态校验（node_modules 未安装）"
fi

# =====================================================================
step "7. 收尾"
# =====================================================================
# 清理本脚本产生的测试会话（避免污染 workspace）
rm -rf .agentscope/workspace/*/regress-* 2>/dev/null
# 检查回归是否产生污染文件（.agentscope 残留、临时日志），而非要求工作区完全干净——
# 回归本来就该在「有未提交改动」时也能跑。
POLLUTION="$(git status --short 2>/dev/null | grep -E '^\?\? (\.agentscope|.*\.log$|.*\.tmp$)' | head -n5)"
if [ -z "$POLLUTION" ]; then
  check "回归未产生污染文件" 1
else
  check "回归未产生污染文件" 0 "发现污染：$POLLUTION"
fi

# =====================================================================
printf '\n\033[1m================= 汇总 =================\033[0m\n'
printf '  PASS %d | FAIL %d | SKIP %d\n' "$PASS" "$FAIL" "$SKIP"
if [ "$FAIL" -gt 0 ]; then
  printf '\n\033[31m失败项：\033[0m\n'
  for f in "${FAILED_STEPS[@]}"; do printf '  - %s\n' "$f"; done
  printf '\n结论：存在失败，禁止提交（见 docs/regression-checklist.md「判定」）。\n'
  exit 1
fi
if [ "$FULL" -eq 0 ]; then
  printf '\n快速回归通过。模型调用类步骤已跳过，完整验证请加 --full。\n'
fi
printf '结论：全绿。\n'
exit 0
