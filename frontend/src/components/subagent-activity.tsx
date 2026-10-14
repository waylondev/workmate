"use client";

import { useSubagents } from "@/ag-ui-runtime-provider";
import { type SubagentRun, type SubagentToolCall } from "@/subagent";
import { useAuiState } from "@assistant-ui/react";
import { cn } from "@/lib/utils";
import {
  BotIcon,
  CheckIcon,
  ChevronDownIcon,
  LoaderCircleIcon,
  WrenchIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  CollapsibleRoot as Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./collapsible-root";

// 子智能体折叠面板：消费 `subagent.*` CUSTOM 事件累积的运行状态，实时展示
// 子智能体的思考 / 正文 / 工具调用。
//
// 仅在事件累积到内容时渲染：历史消息不重放 subagent 事件（刷新后这些事件
// 不会重新到达），因此历史会话里不显示本面板——子智能体的最终输出已由
// agent_spawn 的 tool result 承载。

const ANIMATION_DURATION = 200;

function ToolCallIcon({ status }: { status: SubagentToolCall["status"] }) {
  if (status === "done")
    return <CheckIcon className="size-3.5 shrink-0 text-emerald-500" />;
  if (status === "failed")
    return <XIcon className="text-destructive size-3.5 shrink-0" />;
  return (
    <LoaderCircleIcon className="size-3.5 shrink-0 animate-spin text-sky-500" />
  );
}

function SubagentToolCallItem({ toolCall }: { toolCall: SubagentToolCall }) {
  return (
    <li className="flex items-center gap-2 text-xs">
      <ToolCallIcon status={toolCall.status} />
      <WrenchIcon className="text-muted-foreground size-3 shrink-0" />
      <span className="text-muted-foreground font-mono">{toolCall.name}</span>
      {toolCall.resultState && toolCall.resultState !== "SUCCESS" && (
        <span className="text-destructive/80 text-[10px]">
          {toolCall.resultState}
        </span>
      )}
    </li>
  );
}

function SubagentRunCard({
  run,
  streaming,
}: {
  run: SubagentRun;
  streaming: boolean;
}) {
  // 与 ReasoningRoot 一致的交互：流式期间强制展开并跟随，流式结束后若用户
  // 未手动切换则收起（默认只给结果，细节折叠——P0-4 渐进披露）。
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const isOpen = userOpen ?? streaming;
  const thinkingRef = useRef<HTMLDivElement>(null);

  // 思考区流式期间滚动跟随底部。
  useEffect(() => {
    const element = thinkingRef.current;
    if (!element || !streaming) return;
    element.scrollTop = element.scrollHeight;
  }, [run.thinking, streaming]);

  const doneTools = run.toolCalls.filter(
    (toolCall) => toolCall.status === "done",
  ).length;

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setUserOpen}
      className="group/subagent border-border/60 rounded-lg border"
      style={{ "--animation-duration": `${ANIMATION_DURATION}ms` } as CSSProperties}
    >
      <CollapsibleTrigger className="text-muted-foreground hover:text-foreground flex w-full items-center gap-2 px-3 py-2 text-sm transition-[color,scale] active:scale-[0.98] motion-reduce:transition-none">
        <BotIcon className="size-4 shrink-0" />
        <span className="text-foreground font-medium">子智能体</span>
        <span className="text-muted-foreground font-mono text-xs">
          {run.name}
        </span>
        {streaming ? (
          <span className="text-muted-foreground flex items-center gap-1 text-xs">
            <LoaderCircleIcon className="size-3 animate-spin" />
            运行中
          </span>
        ) : (
          <span className="text-muted-foreground flex items-center gap-1 text-xs">
            <CheckIcon className="size-3 text-emerald-500" />
            完成
          </span>
        )}
        <span className="text-muted-foreground/70 ms-auto flex items-center gap-1 text-xs tabular-nums">
          {doneTools}/{run.toolCalls.length} 工具
        </span>
        <ChevronDownIcon
          className={cn(
            "size-4 shrink-0 transition-transform duration-(--animation-duration) ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
            isOpen ? "rotate-0" : "-rotate-90",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="group/collapsible-content ease-[cubic-bezier(0.32,0.72,0,1)] overflow-hidden text-sm outline-none motion-reduce:animate-none data-closed:animate-collapsible-up data-open:animate-collapsible-down data-closed:fill-mode-forwards data-closed:pointer-events-none [--tw-duration:var(--animation-duration)]">
        <div className="flex flex-col gap-2 px-3 pb-3 ps-5">
          {run.thinking.length > 0 && (
            <div
              ref={thinkingRef}
              className="text-muted-foreground/90 max-h-48 overflow-y-auto rounded-md text-xs leading-relaxed whitespace-pre-wrap"
            >
              {run.thinking}
            </div>
          )}
          {run.toolCalls.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {run.toolCalls.map((toolCall) => (
                <SubagentToolCallItem key={toolCall.id} toolCall={toolCall} />
              ))}
            </ul>
          )}
          {run.text.length > 0 && (
            <p className="text-foreground text-sm leading-relaxed whitespace-pre-wrap">
              {run.text}
            </p>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function SubagentActivity() {
  const runs = useSubagents();
  const isRunning = useAuiState((s) => s.thread.isRunning);

  if (runs.length === 0) return null;

  return (
    <div className="mb-4 flex flex-col gap-2">
      {runs.map((run) => (
        <SubagentRunCard key={run.id} run={run} streaming={isRunning} />
      ))}
    </div>
  );
}
