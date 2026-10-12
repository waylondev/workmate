#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把真实回归输出渲染成终端风格的 GIF 帧序列。

内容 100% 来自 scripts/regression/demo.sh 的真实输出（22 项 PASS / 0 FAIL）。
本脚本只负责「滚动节奏」的视觉编排，不虚构任何检查结果。
"""
import os
from PIL import Image, ImageDraw, ImageFont

# ---- 布局常量 ----
W, H = 760, 560
BG = (13, 17, 23, 255)          # 终端底色 #0d1117
TITLEBAR_BG = (22, 27, 34, 255) # 标题栏
TITLEBAR_H = 36
PAD_X = 30
LINE_H = 30                     # 行高
FONT_PATH = "C:/Windows/Fonts/CascadiaMono.ttf"
CJK_FONT_PATH = "C:/Windows/Fonts/msyh.ttc"   # 中文回退（微软雅黑）

def load_font(size):
    return ImageFont.truetype(FONT_PATH, size)

F_NORMAL = load_font(20)
F_BOLD   = load_font(20)   # 同大小，颜色区分粗细
F_TITLE  = load_font(22)
F_CJK_NORMAL = ImageFont.truetype(CJK_FONT_PATH, 20)
F_CJK_BOLD   = ImageFont.truetype(CJK_FONT_PATH, 20)

import re
_RUN_RE = re.compile(r'([\x00-\x7f]+|[^x00-\x7f]+)')

def draw_mixed(d, xy, text, font_ascii, font_cjk, fill):
    """按 ASCII/非 ASCII 分段绘制，保持视觉连贯。返回结束 x。"""
    x, y = xy
    for run in re.findall(r'[\x00-\x7f]+|[^\x00-\x7f]+', text):
        f = font_ascii if run.isascii() else font_cjk
        d.text((x, y), run, font=f, fill=fill)
        x += d.textlength(run, font=f)
    return x

# 颜色
C_CYAN    = (86, 182, 194)      # 步骤标题 #56b6c2
C_GREEN   = (87, 182, 106)      # PASS #57b66a
C_RED     = (224, 108, 117)     # FAIL
C_WHITE   = (220, 223, 228)     # 正文
C_DIM     = (140, 148, 158)     # 次要文字
C_BAR_FG  = (160, 170, 180)

# ---- 真实输出行（与 demo.sh 输出逐字一致）----
LINES = [
    ("title",  "workmate 一键回归演示"),
    ("dim",    "后端 http://localhost:8080 | 前端 http://localhost:5173 | CPA http://127.0.0.1:8317"),
    ("blank",  ""),
    ("step",   "== 0. 构建门槛 =="),
    ("pass",   "后端构建脚本存在 (build.gradle.kts)"),
    ("pass",   "前端清单存在 (frontend/package.json)"),
    ("step",   "== 1. 三端健康 =="),
    ("pass",   "后端 /actuator/health 返回 UP"),
    ("pass",   "前端 5173 返回 200"),
    ("pass",   "CPA 8317 可达 (200/401)"),
    ("step",   "== 2. Agent 管理 =="),
    ("pass",   "GET /api/agents 返回 default/coder/explorer"),
    ("pass",   "每个 agent 含 registered 字段"),
    ("pass",   "注销 explorer → registered=false"),
    ("pass",   "重新注册 → registered=true"),
    ("step",   "== 3. 定时任务 =="),
    ("pass",   "POST /api/jobs 创建 cron 任务"),
    ("pass",   "GET /api/jobs 列出任务"),
    ("pass",   "GET .../executions 执行历史"),
    ("pass",   "DELETE /api/jobs 取消任务"),
    ("step",   "== 4. AG-UI SSE 流式对话 =="),
    ("pass",   "RUN_STARTED → TEXT_MESSAGE"),
    ("pass",   "token_usage 事件"),
    ("pass",   "RUN_FINISHED"),
    ("step",   "== 5. 子智能体派发 (subagent) =="),
    ("pass",   "agent_spawn 工具调用"),
    ("pass",   "permission_confirm 审批中断 (HITL)"),
    ("step",   "== 6. 前端静态校验 =="),
    ("pass",   "check:ui 全过 (FAIL=0)"),
    ("pass",   "check:agui 全过 (FAIL=0)"),
    ("step",   "== 7. 收尾 =="),
    ("pass",   "回归未产生污染文件"),
    ("blank",  ""),
    ("bar",    "================= 汇总 ================="),
    ("bold",   "PASS 22 | FAIL 0 | SKIP 0"),
    ("blank",  ""),
    ("bold",   "结论：全绿。"),
]

# 每行的「显示持续帧数」（单位帧，帧率约 12fps）
FRAMES_PER_LINE = {
    "title": 14, "dim": 10, "blank": 6, "step": 10, "pass": 8,
    "bar": 12, "bold": 16,
}

def draw_frame(visible_lines):
    """visible_lines: 已显示的行列表 [(kind, text), ...]"""
    img = Image.new("RGBA", (W, H), BG)
    d = ImageDraw.Draw(img)

    # 标题栏
    d.rectangle([0, 0, W, TITLEBAR_H], fill=TITLEBAR_BG)
    d.text((PAD_X, (TITLEBAR_H - 20)//2 - 1), "workmate — bash", font=F_NORMAL, fill=C_DIM)
    # 三个圆点（红黄绿）
    for i, col in enumerate([(224,108,117), (229,192,123), (87,182,106)]):
        cx = W - PAD_X - (3-i)*28
        d.ellipse([cx-6, TITLEBAR_H//2-6, cx+6, TITLEBAR_H//2+6], fill=col)

    # 正文区：从底部向上堆叠，超出的向上滚出
    body_top = TITLEBAR_H + 16
    # 取最后能容纳的行
    max_rows = (H - body_top - 12) // LINE_H
    shown = visible_lines[-max_rows:]
    y = body_top
    for kind, text in shown:
        if kind == "blank":
            pass
        elif kind == "title":
            draw_mixed(d, (PAD_X, y), "  " + text, F_BOLD, F_CJK_BOLD, C_WHITE)
        elif kind == "step":
            draw_mixed(d, (PAD_X, y), text, F_BOLD, F_CJK_BOLD, C_CYAN)
        elif kind == "pass":
            draw_mixed(d, (PAD_X, y), "  PASS  " + text, F_NORMAL, F_CJK_NORMAL, C_GREEN)
        elif kind == "dim":
            draw_mixed(d, (PAD_X, y), "  " + text, F_NORMAL, F_CJK_NORMAL, C_DIM)
        elif kind == "bar":
            draw_mixed(d, (PAD_X, y), text, F_BOLD, F_CJK_BOLD, C_WHITE)
        elif kind == "bold":
            draw_mixed(d, (PAD_X, y), "  " + text, F_BOLD, F_CJK_BOLD, C_GREEN)
        y += LINE_H

    return img

def main():
    out_dir = "build/int/gif_frames"
    os.makedirs(out_dir, exist_ok=True)

    frames = []
    visible = []
    # 逐行累加，每行生成若干帧（模拟逐步滚出）
    for kind, text in LINES:
        visible.append((kind, text))
        n = FRAMES_PER_LINE.get(kind, 8)
        for _ in range(n):
            frames.append(draw_frame(visible))

    # 末尾定格：汇总帧多停留
    for _ in range(30):
        frames.append(draw_frame(visible))

    # 保存 PNG 帧
    for i, fr in enumerate(frames):
        fr.convert("RGB").save(f"{out_dir}/frame_{i:04d}.png")

    print(f"共 {len(frames)} 帧，输出目录 {out_dir}")

if __name__ == "__main__":
    main()
