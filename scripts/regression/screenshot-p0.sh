#!/usr/bin/env bash
# P0 真实浏览器效果图（最终版：合并 v1 审批交互 + v2 低压力轮询）。
# 依赖：CPA(8317) + 后端(8080) + 前端 Vite(5173) 已在运行。
# 产出：build/int/shots/
#   p0-1-command-palette.png   Cmd/Ctrl+K 命令面板
#   p0-2-help-panel.png        ? 快捷键帮助
#   p0-3-subagent-running.png  子智能体运行中（面板展开，N/M 工具计数）
#   p0-4-subagent-done.png     完成态
#
# 实测教训（2026-10-14，两轮翻车后收敛）：
#   1. agent_spawn 是高风险操作，accept-edits「自动放行」不覆盖它 → 必须保留
#      轮询中点「允许」的逻辑，否则会话永久卡在待授权（v2 翻车点）。
#   2. 子智能体运行期间 1s 一次全页 a11y snapshot 对 CDP 压力过大，且 daemon
#      在本环境（无 GPU VM）本身存在间歇性抖动（v1 实测死于事件洪峰到来之前，
#      与前端负载无关）→ 轮询间隔放宽到 10s，daemon 死亡时温和退出、
#      已到手的截图不受影响。
#   3. 键盘快捷键经 eval 派发合成 KeyboardEvent（window 监听器可捕获），
#      snapshot 断言目标文本出现后截图——断言即取证。
set +e
export PATH="/d/Program Files/Git/usr/bin:$PATH"
export MSYS2_ARG_CONV_EXCL='*'
export AGENT_BROWSER_ARGS='--no-sandbox,--disable-gpu'
cd /d/Users/Administrator/workspace/workmate

LOG=/tmp/screenshot-p0.log
: > "$LOG"
log(){ echo "[$(date +%H:%M:%S)] $*" | tee -a "$LOG"; }
AB(){ agent-browser "$@" >>"$LOG" 2>&1; }
SNAP(){ agent-browser snapshot -i 2>>"$LOG"; }
REF(){ local p="$1"; SNAP | grep -oP "$p" | head -1; }

OUT_WIN="D:/Users/Administrator/workspace/workmate/build/int/shots"
mkdir -p /d/Users/Administrator/workspace/workmate/build/int/shots

# daemon 跨任务残留清理（中断的录制/截图会留下 active 状态）
taskkill /F /IM agent-browser-win32-x64.exe >/dev/null 2>&1 || true
taskkill /F /IM chrome.exe >/dev/null 2>&1 || true
sleep 2

AB open 'http://localhost:5173/' &
OPEN_PID=$!
sleep 9

# ---- 1) Cmd/Ctrl+K 命令面板 ----
AB eval "window.dispatchEvent(new KeyboardEvent('keydown',{key:'k',metaKey:true,bubbles:true}))"
sleep 1
pal=$(SNAP | grep -c '搜索命令')
log "palette searchbox count=$pal"
if [ "$pal" -ge 1 ]; then
  AB screenshot "$OUT_WIN/p0-1-command-palette.png"
  log "shot palette"
fi
AB eval "window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))"
sleep 1

# ---- 2) ? 快捷键帮助 ----
AB eval "window.dispatchEvent(new KeyboardEvent('keydown',{key:'?',bubbles:true}))"
sleep 1
helpcnt=$(SNAP | grep -c '键盘快捷键')
log "help heading count=$helpcnt"
if [ "$helpcnt" -ge 1 ]; then
  AB screenshot "$OUT_WIN/p0-2-help-panel.png"
  log "shot help"
fi
AB eval "window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))"
sleep 1

# ---- 3) 切到 Coder + 触发子智能体（default 模式，agent_spawn 走审批）----
CUR_CODER=$(REF 'button "Coder" \[[^\]]*ref=\K[^\]]+')
if [ -z "$CUR_CODER" ]; then
  CHIP=$(REF 'button "Workmate" \[[^\]]*ref=\K[^\]]+')
  [ -n "$CHIP" ] && { AB click "$CHIP"; sleep 1; }
  CODER=$(REF 'menuitemradio "Coder [^"]*" \[[^\]]*ref=\K[^\]]+')
  [ -n "$CODER" ] && { AB click "$CODER"; sleep 1; }
fi

MSG=$(REF 'textbox "Message input" \[[^\]]*ref=\K[^\]]+')
SEND=$(REF 'button "Send message" \[[^\]]*ref=\K[^\]]+')
if [ -z "$MSG" ] || [ -z "$SEND" ]; then log "FAIL no msg/send ref"; AB close; exit 1; fi
AB fill "$MSG" "调用 code-review 子智能体审查 JobController.kt，只看不改，最后给结论。"
sleep 1
AB click "$SEND"
log "sent"

# ---- 低压力轮询：10s 间隔，最多 36 轮（6min）；点「允许」；daemon 死亡温和退出 ----
approved=0; shot3=0; fails=0
for i in $(seq 1 36); do
  sleep 10
  s=$(SNAP 2>/dev/null)
  if [ -z "$s" ]; then
    fails=$((fails+1))
    [ "$fails" -ge 3 ] && { log "daemon dead x$fails @$i"; break; }
    continue
  fi
  fails=0
  allow=$(echo "$s" | grep -oP 'button "允许" \[[^\]]*ref=\K[^\]]+' | head -1)
  if [ -n "$allow" ]; then
    AB click "$allow"; sleep 1
    [ "$approved" = "0" ] && { approved=1; log "approved @$i"; }
    continue
  fi
  if [ "$shot3" = "0" ] && echo "$s" | grep -qP '[0-9]+/[0-9]+ 工具'; then
    AB screenshot "$OUT_WIN/p0-3-subagent-running.png"
    shot3=1; log "shot3 running @$i"
  fi
  send=$(echo "$s" | grep -oP 'button "Send message" \[[^\]]*\]' | head -1)
  if [ -n "$send" ] && ! echo "$send" | grep -q disabled; then
    log "completed @$i"; break
  fi
done

AB screenshot "$OUT_WIN/p0-4-subagent-done.png" 2>/dev/null
AB close
kill "$OPEN_PID" 2>/dev/null
log "DONE palette=$pal help=$helpcnt approved=$approved shot3=$shot3"
ls -la /d/Users/Administrator/workspace/workmate/build/int/shots/ | grep p0
