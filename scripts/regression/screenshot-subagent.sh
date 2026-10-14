#!/usr/bin/env bash
# 真实浏览器截图：子智能体折叠面板（P0-1 效果图）。
# 依赖：CPA(8317) + 后端(8080) + 前端 Vite(5173) 已在运行。
# 用法： bash scripts/regression/screenshot-subagent.sh
# 产出： build/int/shots/shot-1-coder-selected.png（切到 Coder 后）
#        build/int/shots/shot-2-subagent-running.png（子智能体运行中，面板展开）
#        build/int/shots/shot-2b-subagent-midrun.png（运行中段，工具调用累积后）
#        build/int/shots/shot-3-subagent-done.png（完成，面板折叠成 header）
#
# 检测要点（实测教训）：
#   - 面板 header 独有标记 = "N/M 工具" 计数（[0-9]+/[0-9]+ 工具）。
#     不能用「子智能体」/「运行中」做判据——右栏「工作进度 运行中」与对话摘要
#     （含用户消息原文）会造成假阳性，截到子智能体启动前的画面。
set +e
export PATH="/d/Program Files/Git/usr/bin:$PATH"
export MSYS2_ARG_CONV_EXCL='*'
export AGENT_BROWSER_ARGS='--no-sandbox,--disable-gpu'
cd /d/Users/Administrator/workspace/workmate

LOG=/tmp/screenshot-subagent.log
: > "$LOG"
log(){ echo "[$(date +%H:%M:%S)] $*" | tee -a "$LOG"; }
AB(){ agent-browser "$@" >>"$LOG" 2>&1; }
SNAP(){ agent-browser snapshot -i 2>>"$LOG"; }
REF(){ local p="$1"; SNAP | grep -oP "$p" | head -1; }

OUT_WIN="D:/Users/Administrator/workspace/workmate/build/int/shots"
mkdir -p /d/Users/Administrator/workspace/workmate/build/int/shots

# 清理可能残留的 daemon / chromium
taskkill /F /IM agent-browser-win32-x64.exe >/dev/null 2>&1 || true
taskkill /F /IM chrome.exe >/dev/null 2>&1 || true
sleep 2

AB open 'http://localhost:5173/' &
OPEN_PID=$!
sleep 9

# 切到 Coder（子智能体 code-review 归属 Coder）。若已是 Coder 则跳过。
CUR_CODER=$(REF 'button "Coder" \[[^\]]*ref=\K[^\]]+')
if [ -z "$CUR_CODER" ]; then
  CHIP=$(REF 'button "Workmate" \[[^\]]*ref=\K[^\]]+')
  [ -n "$CHIP" ] && { AB click "$CHIP"; sleep 1; }
  CODER=$(REF 'menuitemradio "Coder [^"]*" \[[^\]]*ref=\K[^\]]+')
  [ -n "$CODER" ] && { AB click "$CODER"; sleep 1; }
fi

AB screenshot "$OUT_WIN/shot-1-coder-selected.png"

MSG=$(REF 'textbox "Message input" \[[^\]]*ref=\K[^\]]+')
SEND=$(REF 'button "Send message" \[[^\]]*ref=\K[^\]]+')
if [ -z "$MSG" ] || [ -z "$SEND" ]; then log "FAIL no msg/send ref"; AB close; exit 1; fi
AB fill "$MSG" "调用 code-review 子智能体审查 JobController.kt，只看不改，最后给结论。"
sleep 1
AB click "$SEND"

approved=0; shot2=0; shot2b=0; shot2_at=0; fails=0; seen=0
for i in $(seq 1 240); do
  s=$(SNAP 2>/dev/null)
  if [ -z "$s" ]; then
    fails=$((fails+1))
    [ "$fails" -ge 5 ] && { log "FAIL daemon unreachable x$fails @$i"; break; }
    sleep 3; continue
  fi
  fails=0

  # 1) HITL 审批：出现「允许」立即点（agent_spawn 高风险写操作走审批）
  allow=$(echo "$s" | grep -oP 'button "允许" \[[^\]]*ref=\K[^\]]+' | head -1)
  if [ -n "$allow" ]; then
    AB click "$allow"; sleep 1
    [ "$approved" = "0" ] && { approved=1; log "approved @$i"; }
    continue
  fi
  cancel=$(echo "$s" | grep -oP 'button "Cancel sending"' | head -1)
  [ -n "$cancel" ] && seen=1

  # 2) 面板出现（header 计数 N/M 工具）→ 等 6s 让工具调用累积 → 戳运行中帧
  if [ "$shot2" = "0" ] && echo "$s" | grep -qP '[0-9]+/[0-9]+ 工具'; then
    log "panel detected @$i, wait 6s for accumulation"
    sleep 6
    AB screenshot "$OUT_WIN/shot-2-subagent-running.png"
    shot2=1; shot2_at=$i; log "shot2 running @$i"
  elif [ "$shot2" = "1" ] && [ "$shot2b" = "0" ] && [ $((i-shot2_at)) -ge 12 ]; then
    AB screenshot "$OUT_WIN/shot-2b-subagent-midrun.png"
    shot2b=1; log "shot2b midrun @$i"
  fi

  # 3) 完成判据：Send message 恢复 enabled（与 Cancel sending 互斥）
  send=$(echo "$s" | grep -oP 'button "Send message" \[[^\]]*\]' | head -1)
  if [ -n "$send" ] && ! echo "$send" | grep -q disabled; then
    log "completed @$i"
    break
  fi
  sleep 1
done

# 完成后截最终态（面板折叠成 header，只给结果）
sleep 1
AB screenshot "$OUT_WIN/shot-3-subagent-done.png"

AB close
kill "$OPEN_PID" 2>/dev/null
log "DONE approved=$approved shot2=$shot2 shot2b=$shot2b fails=$fails"
ls -la /d/Users/Administrator/workspace/workmate/build/int/shots/
