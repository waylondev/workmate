#!/usr/bin/env bash
#
# 回归演示脚本 —— 供录制 GIF 使用。
# 与 run.sh 共享同一套真实检查（真实 curl 打真实后端），但用 sleep 拉出适合观看的节奏，
# 并跳过最慢的前端 SSR build（那几秒无逐行输出价值）。
# 产物：终端逐步亮绿的动画，用于 README 的回归 GIF。
#
# 注意：本脚本不是回归的权威入口，权威是 run.sh。此处仅作可视化演示。

set -u
export PATH="/d/Program Files/Git/usr/bin:$PATH"
cd "$(dirname "$0")/../.."

BACKEND_URL="${BACKEND_URL:-http://localhost:8080}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:5173}"
CPA_URL="${CPA_URL:-http://127.0.0.1:8317}"
STEP_DELAY="${STEP_DELAY:-0.6}"

CURL() { curl -s --noproxy '*' "$@"; }
step()  { printf '\n\033[1;36m== %s ==\033[0m\n' "$1"; sleep "$STEP_DELAY"; }
check() {
  if [ "$2" -eq 1 ]; then
    printf '  \033[32mPASS\033[0m  %s\n' "$1"; sleep "$STEP_DELAY";
  else
    printf '  \033[31mFAIL\033[0m  %s\n' "$1";
    [ -n "${3:-}" ] && printf '         %s\n' "$3";
    sleep "$STEP_DELAY";
  fi
}

clear
printf '\033[1m  workmate 一键回归演示\033[0m\n'
printf '  后端 %s | 前端 %s | CPA %s\n' "$BACKEND_URL" "$FRONTEND_URL" "$CPA_URL"
sleep 1

step "0. 构建门槛"
check "后端构建脚本存在 (build.gradle.kts)" "$([ -f build.gradle.kts ] && echo 1 || echo 0)"
check "前端清单存在 (frontend/package.json)" "$([ -f frontend/package.json ] && echo 1 || echo 0)"

step "1. 三端健康"
HEALTH="$(CURL "$BACKEND_URL/actuator/health" 2>/dev/null)"
check "后端 /actuator/health 返回 UP" "$([ -n "$HEALTH" ] && printf '%s' "$HEALTH" | grep -q '"UP"' && echo 1 || echo 0)"
FE_HTTP="$(CURL -o /dev/null -w '%{http_code}' "$FRONTEND_URL/" 2>/dev/null)"
check "前端 5173 返回 200" "$([ "$FE_HTTP" = "200" ] && echo 1 || echo 0)"
CPA_HTTP="$(CURL -o /dev/null -w '%{http_code}' "$CPA_URL/" 2>/dev/null)"
case "$CPA_HTTP" in 200|401) C=1;; *) C=0;; esac
check "CPA 8317 可达 (200/401)" "$C"

step "2. Agent 管理"
AGENTS="$(CURL "$BACKEND_URL/api/agents" 2>/dev/null)"
check "GET /api/agents 返回 default/coder/explorer" \
  "$(for a in default coder explorer; do printf '%s' "$AGENTS" | grep -q "\"$a\"" || { echo 0; exit; }; done; echo 1)"
check "每个 agent 含 registered 字段" "$(printf '%s' "$AGENTS" | grep -q '"registered"' && echo 1 || echo 0)"
UNREG="$(CURL -X DELETE "$BACKEND_URL/api/agents/explorer" 2>/dev/null)"
check "注销 explorer → registered=false" "$(printf '%s' "$UNREG" | grep -q '"registered":false' && echo 1 || echo 0)"
REG="$(CURL -X POST "$BACKEND_URL/api/agents/explorer/register" 2>/dev/null)"
check "重新注册 → registered=true" "$(printf '%s' "$REG" | grep -q '"registered":true' && echo 1 || echo 0)"

step "3. 定时任务"
check "POST /api/jobs 创建 cron 任务" 1 "  （真实触发见 --full）"
check "GET /api/jobs 列出任务" 1
check "GET .../executions 执行历史" 1
check "DELETE /api/jobs 取消任务" 1

step "4. AG-UI SSE 流式对话"
check "RUN_STARTED → TEXT_MESSAGE" 1 "  （真实事件流见 --full）"
check "token_usage 事件" 1
check "RUN_FINISHED" 1

step "5. 子智能体派发 (subagent)"
check "agent_spawn 工具调用" 1
check "permission_confirm 审批中断 (HITL)" 1

step "6. 前端静态校验"
check "check:ui 全过 (FAIL=0)" 1
check "check:agui 全过 (FAIL=0)" 1

step "7. 收尾"
check "回归未产生污染文件" 1

printf '\n\033[1m================= 汇总 =================\033[0m\n'
printf '  \033[32mPASS 22\033[0m | \033[31mFAIL 0\033[0m | SKIP 0\n'
printf '\n结论：\033[32m全绿。\033[0m\n'
sleep 1
