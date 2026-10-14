"use client";

import { SHORTCUTS } from "@/keyboard";
import { XIcon } from "lucide-react";

/**
 * `?` 快捷键帮助面板：展示全部键盘快捷键（目录来自 `keyboard.ts`，
 * 与实际按键处理共用一份定义，避免漂移）。
 *
 * <p>由 App 外壳以条件渲染控制挂载（关闭即卸载）；Esc 关闭由全局按键处理，
 * 背板点击 / 关闭按钮同样可关。
 */
export function KeyboardHelp({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/10" onClick={onClose} />
      <div className="glass bg-popover/95 absolute top-1/2 left-1/2 w-[26rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">键盘快捷键</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="text-muted-foreground hover:text-foreground rounded-md p-1 transition-colors"
          >
            <XIcon className="size-4" />
          </button>
        </div>
        <ul className="flex flex-col gap-2.5">
          {SHORTCUTS.map((item) => (
            <li key={item.label} className="flex items-center gap-3">
              <span className="flex w-24 shrink-0 items-center gap-1">
                {item.keys.map((key) => (
                  <kbd
                    key={key}
                    className="border-border/70 bg-muted/50 rounded-md border px-1.5 py-0.5 text-[11px] font-mono"
                  >
                    {key}
                  </kbd>
                ))}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-medium">{item.label}</span>
                <span className="text-muted-foreground text-xs">
                  {item.description}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
