#!/usr/bin/env bash
# 真实浏览器回归录屏（workmate 全场景，覆盖全部官方能力）。
# 单命令内拉起 CPA + 后端 + 前端（互相可达），用 agent-browser 录制，再 ffmpeg 转 MP4。
# 用法： bash scripts/regression/record-demo.sh
#
# 覆盖能力矩阵（与 docs/verified-capabilities.md 对齐）：
#   核心对话（SSE 流式 + 推理 + token 用量 + 工具调用 + 工作进度）
#   Agent 切换（composer chip） · 子智能体派发（agent_spawn + HITL）
#   技能 / 定时任务 / Agent 三个管理面板 · 会话切换（SessionTree 多轮上下文持久化）
#   HITL 工具授权闭环
set +e
export PATH="/d/Program Files/Git/usr/bin:$PATH"
export MSYS2_ARG_CONV_EXCL='*'
export JAVA_HOME='D:/Users/Administrator/.jdks/jdk-25.0.4.1+1'
export OPENAI_API_KEY='sk-workmate-cpa-7d2b'
export OPENAI_BASE_URL='http://127.0.0.1:8317/v1'
export OPENAI_MODEL='hy3'
cd /d/Users/Administrator/workspace/workmate

LOG=/tmp/record-demo.log
: > "$LOG"
log(){ echo "[$(date +%H:%M:%S)] $*" | tee -a "$LOG"; }
AB(){ agent-browser "$@" 2>>"$LOG"; }

kill_port(){
  local port="$1" pid
  pid=$(netstat -ano 2>/dev/null | grep -E ":$port +" | grep LISTENING | awk '{print $5}' | head -1)
  if [ -n "$pid" ]; then log "kill port $port pid=$pid"; taskkill //F //PID "$pid" >/dev/null 2>&1 || true; fi
}

# ---- 释放端口，避免旧进程冲突 ----
kill_port 8080; kill_port 5173; kill_port 8317
sleep 2

# ---- 拉起三端 ----
log "launch CPA";  ( cd /d/CPA/app && exec "D:/CPA/app/cli-proxy-api.exe" ) >>/tmp/cpa.log 2>&1 & CPA=$!
log "launch backend"; "$JAVA_HOME/bin/java" -jar build/libs/workmate-0.0.1-SNAPSHOT.jar --server.port=8080 >>/tmp/be.log 2>&1 & BE=$!
log "launch frontend"; ( cd frontend && exec npm run dev ) >>/tmp/fe.log 2>&1 & FE=$!

wait_http(){ for i in $(seq 1 "$2"); do code=$(curl -s --noproxy '*' -o /dev/null -w '%{http_code}' "$1" 2>/dev/null); [ "$code" = "200" ] && return 0; sleep 1; done; return 1; }
log "wait CPA";     wait_http 'http://127.0.0.1:8317/v1/models' 30 || log "WARN cpa not 200"
log "wait backend"; wait_http 'http://127.0.0.1:8080/api/agents' 120 || { log "FAIL backend"; kill_port 8080; kill_port 5173; kill_port 8317; exit 1; }
log "wait frontend";wait_http 'http://localhost:5173/' 60 || { log "FAIL frontend"; kill_port 8080; kill_port 5173; kill_port 8317; exit 1; }

# ---- 解析助手 ----
SNAP(){ agent-browser snapshot -i 2>>"$LOG"; }
REF(){ local p="$1"; SNAP | grep -oP "$p" | head -1; }
get_msg(){  REF 'textbox "Message input" \[[^\]]*ref=\K[^\]]+'; }
get_send(){ REF 'button "Send message" \[[^\]]*ref=\K[^\]]+'; }
get_nav(){  REF "button \"$1\" \[[^\]]*ref=\K[^\]]+"; }
wait_idle(){
  for i in $(seq 1 30); do
    local s ln; s=$(SNAP); ln=$(echo "$s" | grep -oP 'button "Send message" \[[^\]]*\]' | head -1)
    if [ -n "$ln" ] && ! echo "$ln" | grep -q disabled; then return 0; fi
    sleep 2
  done
  return 1
}
# 会话行 ref（排除导航/agent chip），按 DOM 顺序 = 会话列表顺序（最新在前）
sess_refs(){
  SNAP | grep -oP 'button "[^"]*" \[[^\]]*ref=(e\d+)\]' \
    | grep -vP 'button "(新建对话|定时任务|技能|Agent 管理|Workmate|Coder|Explorer)" ' \
    | grep -oP 'ref=\K[^\]]+'
}
sess_at(){ sess_refs | sed -n "${1}p"; }

send_msg(){
  local text="$1" MSG SEND
  MSG=$(get_msg); SEND=$(get_send)
  if [ -z "$MSG" ] || [ -z "$SEND" ]; then log "WARN no input/send ref, skip: ${text:0:16}"; return 1; fi
  AB type "$MSG" "$text" >>"$LOG" 2>&1; sleep 1
  AB click "$SEND" >>"$LOG" 2>&1
  wait_idle
  log "sent: ${text:0:24}"
}

click_ref(){ local r="$1"; [ -n "$r" ] && { AB click "$r" >>"$LOG" 2>&1; sleep 2; } || log "WARN ref empty for $2"; }

# HITL 审批：等待「允许」按钮出现并点击（每次最多等 50s）
handle_approval(){
  local ALLOW=""
  for i in $(seq 1 25); do
    ALLOW=$(REF 'button "允许" \[[^\]]*ref=\K[^\]]+')
    [ -n "$ALLOW" ] && break
    sleep 2
  done
  if [ -n "$ALLOW" ]; then
    log "HITL 允许 found ref=$ALLOW"
    AB click "$ALLOW" >>"$LOG" 2>&1; sleep 1; wait_idle
  else
    log "WARN HITL 允许 未出现（模型未触发待授权工具）"
  fi
}

# ---- 录制 ----
OUT_WEBM="docs/regression-recording-$(date +%Y-%m-%d).webm"
OUT_MP4="${OUT_WEBM%.webm}.mp4"
AB open 'http://localhost:5173/' >>"$LOG" 2>&1
AB wait --load networkidle >>"$LOG" 2>&1; sleep 2
log "record start $OUT_WEBM"
AB record start "$OUT_WEBM" >>"$LOG" 2>&1; sleep 1

# 1) 默认 agent：通用能力 + 埋上下文（为后续会话切换验证铺路）
send_msg "用一句话介绍你自己，并列出你最擅长的三类任务。另外请记住：我的幸运数字是 42。"

# 2) agent 切换（composer chip → Coder）：代码生成
CHIP=$(REF 'button "Workmate" \[[^\]]*ref=\K[^\]]+')
click_ref "$CHIP" "chip-open"
CODER=$(REF 'menuitemradio "Coder" \[[^\]]*ref=\K[^\]]+')
click_ref "$CODER" "coder"
send_msg "用 Python 写一个快速排序函数，并加中文注释。"

# 3) 子智能体派发（coder → code-review）+ HITL 审批
send_msg "调用 code-review 子智能体，审查刚才那段快速排序代码的边界情况与代码风格。"
handle_approval

# 4) 技能管理面板（侧栏导航）
SK=$(get_nav "技能"); click_ref "$SK" "skills"
S1=$(sess_at 1); click_ref "$S1" "back-to-S1"   # 仅 1 个会话，返回聊天

# 5) 新建会话 S2（仍为 Coder）
NC=$(get_nav "新建对话"); click_ref "$NC" "newchat"
log "S2 created (Coder)"
send_msg "换个话题：给我三个提升工作专注力的具体建议。"

# 6) 定时任务面板 + 切回 S1（演示会话切换入口）
JB=$(get_nav "定时任务"); click_ref "$JB" "jobs"
S1=$(sess_at 2); click_ref "$S1" "switch-S1"   # 列表=[S2,S1]，S1=index2

# 7) 会话切换：S1 的上下文（幸运数字 + 三类任务）仍在 → SessionTree 持久化
send_msg "我的幸运数字是多少？并复述你之前列出的三类任务。"

# 8) 切到 S2 验证会话隔离
S2=$(sess_at 1); click_ref "$S2" "switch-S2"
send_msg "复述你刚才给我的三个专注力建议。"

# 9) 切回 S1
S1=$(sess_at 2); click_ref "$S1" "switch-S1"

# 10) Agent 管理面板
AG=$(get_nav "Agent 管理"); click_ref "$AG" "agents"
S2=$(sess_at 1); click_ref "$S2" "back-to-S2"

# 11) HITL 审批：切回默认 agent（default=需审批），发起工具调用
CHIP=$(REF 'button "Coder" \[[^\]]*ref=\K[^\]]+'); click_ref "$CHIP" "chip-open2"
WM=$(REF 'menuitemradio "Workmate" \[[^\]]*ref=\K[^\]]+'); click_ref "$WM" "workmate"
log "switched to Workmate (HITL)"
send_msg "请使用工具读取工作区根目录的 README.md 并总结前三节要点。"
handle_approval

AB record stop >>"$LOG" 2>&1
AB close >>"$LOG" 2>&1
log "record stopped"

# ---- 转 MP4 + 抽帧校验 ----
ffmpeg -y -i "$OUT_WEBM" -c:v libx264 -pix_fmt yuv420p -movflags +faststart "$OUT_MP4" >>"$LOG" 2>&1 \
  && log "converted $OUT_MP4" || log "WARN ffmpeg failed"
ffmpeg -y -ss 20 -i "$OUT_MP4" -frames:v 1 /tmp/record-frame.png >>"$LOG" 2>&1 && log "frame extracted" || true
rm -f "$OUT_WEBM"
log "mp4 size: $(stat -c%s "$OUT_MP4" 2>/dev/null || echo ?)"

# ---- 清理 ----
kill $CPA $BE $FE 2>/dev/null
kill_port 8080; kill_port 5173; kill_port 8317
log "DONE"
