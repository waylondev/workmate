#!/usr/bin/env bash
# 真实浏览器录屏（workmate showcase，README 顶部示例视频）。
# 单命令内拉起 CPA + 后端 + 前端（互相可达），用 agent-browser 录制，再 ffmpeg 转 MP4。
# 用法： bash scripts/regression/record-demo.sh          # 原始节奏（完整回归证据）
#       SPEED=2 bash scripts/regression/record-demo.sh   # 额外产出 docs/showcase.mp4（2 倍速，README 用）
#
# 覆盖能力（与 README「核心功能」表对齐）：
#   流式对话（SSE + 思考卡片 + token 用量 + 工作进度）
#   Agent 切换（composer chip） · HITL 工具授权闭环（记忆写触发审批）
#   会话切换（SessionTree 多轮上下文持久化） · 定时任务 / 技能 / Agent 管理面板
#
# 环境要点（实测）：
#   - 虚拟机无 GPU 加速，必须 AGENT_BROWSER_ARGS='--no-sandbox,--disable-gpu'，否则 chromium GPU 进程崩溃卡死。
#   - agent-browser open 导航成功后 CLI 不退出（vite HMR 持续活动），故 open 走后台 + sleep。
#   - menuitemradio 的 accessible name = "name + 空格 + description"（如 "Coder 编码助手，..."），须前缀匹配。
#   - 会话列表按钮 name = 标题（"新会话" 或首条消息摘要），用「删除会话 X」按钮作为锚点定位主按钮。
#   - hy3 是 reasoning 模型（实测简单问题 ~2s，仅比 deepseek-v4-flash 慢 0.4s）。历史上「每轮几分钟」
#     误判为模型慢，实为 wait_idle 完成判据 bug（见 send_msg 注释），修复后无需靠换模型压节奏。
set +e
export PATH="/d/Program Files/Git/usr/bin:$PATH"
export MSYS2_ARG_CONV_EXCL='*'
export JAVA_HOME='D:/Users/Administrator/.jdks/jdk-25.0.4.1+1'
export OPENAI_API_KEY='sk-workmate-cpa-7d2b'
export OPENAI_BASE_URL='http://127.0.0.1:8317/v1'
export OPENAI_MODEL='hy3'   # 用户指定改回 hy3 实测（reasoning 模型；之前「每轮几分钟」实为 wait_idle 判据 bug，修复后重测真实节奏）
# 关键：虚拟机无 GPU 加速，必须禁用 GPU 否则 chromium 启动卡死（GPU 进程访问冲突）
export AGENT_BROWSER_ARGS='--no-sandbox,--disable-gpu'
cd /d/Users/Administrator/workspace/workmate

TARGET_SEC="${TARGET_SEC:-60}"   # showcase 目标时长（秒），录完后自动按比例倍速压缩
LOG=/tmp/record-demo.log
: > "$LOG"
log(){ echo "[$(date +%H:%M:%S)] $*" | tee -a "$LOG"; }
AB(){ agent-browser "$@" >>"$LOG" 2>&1; }

kill_port(){
  local port="$1" pid
  pid=$(netstat -ano 2>/dev/null | grep -E ":$port +" | grep LISTENING | awk '{print $5}' | head -1)
  if [ -n "$pid" ]; then log "kill port $port pid=$pid"; taskkill /F /PID "$pid" >/dev/null 2>&1 || true; fi
}

# ---- 释放端口，避免旧进程冲突 ----
kill_port 8080; kill_port 5173; kill_port 8317
# agent-browser daemon 是跨任务残留的（上一次被中断的录制会留下 active recording 状态），
# 不清会导致下次 record start 报 "Recording already active" / daemon 连接被拒。
taskkill /F /IM agent-browser-win32-x64.exe >/dev/null 2>&1 || true
taskkill /F /IM chrome.exe >/dev/null 2>&1 || true
sleep 2

# ---- 拉起三端 ----
log "launch CPA";  ( cd /d/CPA/app && exec "D:/CPA/app/cli-proxy-api.exe" ) >>/tmp/cpa.log 2>&1 & CPA=$!
log "launch backend"; "$JAVA_HOME/bin/java" -jar build/libs/workmate-0.0.1-SNAPSHOT.jar --server.port=8080 >>/tmp/be.log 2>&1 & BE=$!
log "launch frontend"; ( cd frontend && exec npm run dev ) >>/tmp/fe.log 2>&1 & FE=$!

wait_http(){ for i in $(seq 1 "$2"); do code=$(curl -s --noproxy '*' -o /dev/null -w '%{http_code}' "$1" 2>/dev/null); [ "$code" = "200" ] && return 0; sleep 1; done; return 1; }
log "wait backend"; wait_http 'http://127.0.0.1:8080/api/agents' 120 || { log "FAIL backend"; kill_port 8080; kill_port 5173; kill_port 8317; exit 1; }
log "wait frontend";wait_http 'http://localhost:5173/' 60 || { log "FAIL frontend"; kill_port 8080; kill_port 5173; kill_port 8317; exit 1; }

# ---- 解析助手 ----
SNAP(){ agent-browser snapshot -i 2>>"$LOG"; }
REF(){ local p="$1"; SNAP | grep -oP "$p" | head -1; }
get_msg(){  REF 'textbox "Message input" \[[^\]]*ref=\K[^\]]+'; }
get_send(){ REF 'button "Send message" \[[^\]]*ref=\K[^\]]+'; }
get_nav(){  REF "button \"$1\" \[[^\]]*ref=\K[^\]]+"; }
wait_idle(){
  # 响应完成 = 出现 enabled 的 "Send message"（响应中会显示 "Stop generating"）
  for i in $(seq 1 60); do
    local s ln; s=$(SNAP); ln=$(echo "$s" | grep -oP 'button "Send message" \[[^\]]*\]' | head -1)
    if [ -n "$ln" ] && ! echo "$ln" | grep -q disabled; then return 0; fi
    sleep 1
  done
  return 1
}
# 发送消息并等待完成；期间自动点击 HITL「允许」审批（出现即点，不等超时，避免空等数分钟）
# 完成判据（assistant-ui Composer 状态机）：发送中显示 "Cancel sending"，空闲显示 "Send message"，
# 二者互斥，故不能只盯 Send；正确判据 = Cancel sending 消失（或 Send 恢复 enabled）。
send_msg(){
  local text="$1" MSG SEND
  MSG=$(get_msg); SEND=$(get_send)
  if [ -z "$MSG" ] || [ -z "$SEND" ]; then log "WARN no input/send ref, skip: ${text:0:16}"; return 1; fi
  AB fill "$MSG" "$text"; sleep 1
  AB click "$SEND"
  local i allow send cancel stop s seen=0 idle=0
  for i in $(seq 1 120); do
    s=$(SNAP)
    # 1) 审批优先：出现「允许」立即点击，让 agent 继续（否则 agent 卡在等待授权）
    allow=$(echo "$s" | grep -oP 'button "允许" \[[^\]]*ref=\K[^\]]+' | head -1)
    if [ -n "$allow" ]; then
      log "HITL allow auto-click"
      AB click "$allow"; sleep 1; idle=0
      continue
    fi
    # 2) 生成中：Cancel sending 存在则继续等
    cancel=$(echo "$s" | grep -oP 'button "Cancel sending"' | head -1)
    if [ -n "$cancel" ]; then seen=1; idle=0; sleep 1; continue; fi
    # 3) 完成：Send message 恢复 enabled
    send=$(echo "$s" | grep -oP 'button "Send message" \[[^\]]*\]' | head -1)
    if [ -n "$send" ] && ! echo "$send" | grep -q disabled; then return 0; fi
    # 4) Stop generating（canCancel 未复位：审批等待或完成后的异常态）：连续稳定多轮视为完成
    stop=$(echo "$s" | grep -oP 'button "Stop generating"' | head -1)
    if [ -n "$stop" ]; then
      idle=$((idle+1))
      [ "$idle" -ge 10 ] && return 0
      sleep 1; continue
    fi
    # 5) 无任何标志且之前见过生成 → 完成
    [ "$seen" = "1" ] && return 0
    sleep 1
  done
  log "WARN timeout: ${text:0:16}"
  return 1
}
# 会话主按钮 ref：每个会话行 = 主按钮 + 紧随的「删除会话 X」按钮；取删除按钮前一行。
# 注意：grep -P 的 \K 在 awk 管道后的中文行上失效，故用 ref=e[0-9]+ + sed 去前缀。
sess_refs(){
  SNAP 2>/dev/null | awk '/button "删除会话/{if(prev)print prev} {prev=$0}' \
    | grep -oP 'ref=e[0-9]+' | sed 's/ref=//'
}
sess_at(){ sess_refs | sed -n "${1}p"; }

click_ref(){ local r="$1"; [ -n "$r" ] && { AB click "$r"; sleep 1; } || log "WARN ref empty for $2"; }

# ---- 录制 ----
# agent-browser 是 Windows 二进制，只认 Windows 绝对路径（D:/...）；rm/stat 是 MSYS 命令，认 /d/...
OUT_BASE="regression-recording-$(date +%Y-%m-%d)"
OUT_DIR_WIN="D:/Users/Administrator/workspace/workmate/docs"
OUT_DIR_MSYS="/d/Users/Administrator/workspace/workmate/docs"
OUT_WEBM="$OUT_DIR_WIN/$OUT_BASE.webm"
OUT_MP4="$OUT_DIR_WIN/$OUT_BASE.mp4"
AB open 'http://localhost:5173/' &
OPEN_PID=$!
sleep 9
log "record start $OUT_WEBM"
AB record start "$OUT_WEBM"; sleep 1
# 注入鼠标点击高亮：点击位置显示醒目红圈，且常驻（下次点击才移动），保证倍速压缩后点击依然可见
AB eval '(function(){if(window.__fx)return;window.__fx=1;var st=document.createElement("style");st.textContent=".__ripple{position:fixed;width:36px;height:36px;border:3px solid #ff2d55;border-radius:50%;transform:translate(-50%,-50%);pointer-events:none;z-index:99999;box-shadow:0 0 0 6px rgba(255,45,85,.35),0 0 24px 10px rgba(255,45,85,.55)}";document.head.appendChild(st);var cur=null;document.addEventListener("pointerdown",function(e){if(cur)cur.remove();var r=document.createElement("div");r.className="__ripple";r.style.left=e.clientX+"px";r.style.top=e.clientY+"px";document.body.appendChild(r);cur=r},true)})()'

# 1) 创建 S1 + Workmate 通用对话（流式 + 思考 + token）+ 埋上下文 + HITL（记忆写触发审批）
NC=$(get_nav "新建对话"); click_ref "$NC" "newchat-S1"
send_msg "用一句话介绍你自己，并记住我的幸运数字是 42。"

# 2) agent 切换（Workmate → Coder）：代码生成（直接回复代码，不写文件，保证有最终文本回复）
CHIP=$(REF 'button "Workmate" \[[^\]]*ref=\K[^\]]+')
click_ref "$CHIP" "chip-open"
CODER=$(REF 'menuitemradio "Coder [^"]*" \[[^\]]*ref=\K[^\]]+')
click_ref "$CODER" "coder"
send_msg "用 Python 写一个斐波那契函数，直接把代码写在回复里，加一句中文注释。"

# 3) 切回 Workmate（准备会话切换演示）
CHIP=$(REF 'button "Coder" \[[^\]]*ref=\K[^\]]+'); click_ref "$CHIP" "chip-open2"
WM=$(REF 'menuitemradio "Workmate [^"]*" \[[^\]]*ref=\K[^\]]+'); click_ref "$WM" "workmate"
log "switched back to Workmate"

# 4) 新建会话 S2 + 对话
NC=$(get_nav "新建对话"); click_ref "$NC" "newchat-S2"
log "S2 created"
send_msg "给我一个提升工作专注力的建议。"

# 5) 切回 S1 验证上下文持久化（核心卖点：SessionTree 落盘）
S1=$(sess_at 2); click_ref "$S1" "switch-S1"
send_msg "我让你记住的幸运数字是多少？"

# 6) 管理面板快速浏览：定时任务 → 技能 → Agent 管理
JB=$(get_nav "定时任务"); click_ref "$JB" "jobs"
SK=$(get_nav "技能"); click_ref "$SK" "skills"
AG=$(get_nav "Agent 管理"); click_ref "$AG" "agents"

AB record stop
AB close
log "record stopped"

# ---- 转 MP4 + 抽帧校验 ----
ffmpeg -y -i "$OUT_WEBM" -c:v libx264 -pix_fmt yuv420p -movflags +faststart "$OUT_MP4" >>"$LOG" 2>&1 \
  && log "converted $OUT_MP4" || log "WARN ffmpeg failed"
ffmpeg -y -ss 20 -i "$OUT_MP4" -frames:v 1 "$OUT_DIR_WIN/frame-$OUT_BASE.png" >>"$LOG" 2>&1 && log "frame extracted" || true
rm -f "$OUT_DIR_MSYS/$OUT_BASE.webm"
log "mp4 size: $(stat -c%s "$OUT_DIR_MSYS/$OUT_BASE.mp4" 2>/dev/null || echo ?)"

# ---- 压缩到目标时长（README showcase）----
DUR=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$OUT_MP4" 2>/dev/null)
SPEED=$(awk "BEGIN{printf \"%.3f\", $DUR/$TARGET_SEC}")
if [ "$(awk "BEGIN{print ($SPEED<1.0)}")" = "1" ]; then SPEED=1.0; fi
PTS=$(awk "BEGIN{printf \"%.4f\", 1/$SPEED}")
ffmpeg -y -i "$OUT_MP4" -filter:v "setpts=${PTS}*PTS" -an -c:v libx264 -pix_fmt yuv420p -movflags +faststart "$OUT_DIR_WIN/showcase.mp4" >>"$LOG" 2>&1 \
  && log "showcase ${SPEED}x -> ~${TARGET_SEC}s" || log "WARN showcase failed"
log "showcase size: $(stat -c%s "$OUT_DIR_MSYS/showcase.mp4" 2>/dev/null || echo ?)"

# ---- 清理 ----
kill "$OPEN_PID" "$CPA" "$BE" "$FE" 2>/dev/null
kill_port 8080; kill_port 5173; kill_port 8317
log "DONE"
