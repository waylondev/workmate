"use client";

import type { AgentInfo } from "@/agents";
import { cn } from "@/lib/utils";
import type { AdminKey } from "@/nav";
import {
  BotIcon,
  CheckIcon,
  ClockIcon,
  PanelLeftIcon,
  PanelRightIcon,
  SearchIcon,
  SquarePenIcon,
  WrenchIcon,
} from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";

type Command = {
  id: string;
  group: string;
  label: string;
  hint?: string;
  keywords: string;
  icon: ReactNode;
  current?: boolean;
  run: () => void;
};

/**
 * Cmd/Ctrl+K 命令面板：搜索并执行「新建对话 / 切换 Agent / 导航 / 视图开关」。
 *
 * <p>由 App 外壳以条件渲染控制挂载（关闭即卸载，状态自然复位），面板内部只负责
 * 搜索过滤与键盘导航（↑↓ 移动、Enter 执行、Esc 关闭）。不依赖 useAuiState，
 * 因此可挂在 `AgUiRuntimeProvider` 之外。
 */
export function CommandPalette({
  onClose,
  agents,
  agentId,
  onNewChat,
  onSwitchAgent,
  onNav,
  sidebarOpen,
  panelOpen,
  onToggleSidebar,
  onTogglePanel,
}: {
  onClose: () => void;
  agents: AgentInfo[];
  agentId: string;
  onNewChat: () => void;
  onSwitchAgent: (id: string) => void;
  onNav: (key: AdminKey) => void;
  sidebarOpen: boolean;
  panelOpen: boolean;
  onToggleSidebar: () => void;
  onTogglePanel: () => void;
}) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo<Command[]>(() => {
    const list: Command[] = [
      {
        id: "new-chat",
        group: "会话",
        label: "新建对话",
        keywords: "new chat create 新建 会话",
        icon: <SquarePenIcon className="size-4" />,
        run: () => {
          onNewChat();
          onClose();
        },
      },
      ...agents.map((agent) => ({
        id: `agent-${agent.id}`,
        group: "Agent",
        label: `切换到 ${agent.name}`,
        hint: agent.description,
        keywords: `agent ${agent.name} ${agent.id} 切换 模型`,
        icon: <BotIcon className="size-4" />,
        current: agent.id === agentId,
        run: () => {
          onSwitchAgent(agent.id);
          onClose();
        },
      })),
      {
        id: "nav-jobs",
        group: "导航",
        label: "定时任务",
        keywords: "jobs 定时 任务 schedule",
        icon: <ClockIcon className="size-4" />,
        run: () => {
          onNav("jobs");
          onClose();
        },
      },
      {
        id: "nav-skills",
        group: "导航",
        label: "技能",
        keywords: "skills 技能 skill",
        icon: <WrenchIcon className="size-4" />,
        run: () => {
          onNav("skills");
          onClose();
        },
      },
      {
        id: "nav-agents",
        group: "导航",
        label: "Agent 管理",
        keywords: "agents 管理 agent",
        icon: <BotIcon className="size-4" />,
        run: () => {
          onNav("agents");
          onClose();
        },
      },
      {
        id: "toggle-sidebar",
        group: "视图",
        label: sidebarOpen ? "收起侧栏" : "展开侧栏",
        keywords: "sidebar 侧栏 左栏",
        icon: <PanelLeftIcon className="size-4" />,
        run: () => {
          onToggleSidebar();
          onClose();
        },
      },
      {
        id: "toggle-panel",
        group: "视图",
        label: panelOpen ? "收起对话摘要" : "展开对话摘要",
        keywords: "panel 摘要 右栏 progress",
        icon: <PanelRightIcon className="size-4" />,
        run: () => {
          onTogglePanel();
          onClose();
        },
      },
    ];
    return list;
  }, [
    agents,
    agentId,
    sidebarOpen,
    panelOpen,
    onNewChat,
    onSwitchAgent,
    onNav,
    onToggleSidebar,
    onTogglePanel,
    onClose,
  ]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((command) =>
      `${command.label} ${command.hint ?? ""} ${command.keywords} ${command.group}`
        .toLowerCase()
        .includes(q),
    );
  }, [commands, query]);

  const runActive = () => {
    const command = filtered[activeIndex];
    if (command) command.run();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % Math.max(filtered.length, 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(
        (index) => (index - 1 + Math.max(filtered.length, 1)) % Math.max(filtered.length, 1),
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      runActive();
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  const items: (
    | { kind: "header"; group: string }
    | { kind: "cmd"; cmd: Command; index: number }
  )[] = [];
  filtered.forEach((cmd, index) => {
    if (index === 0 || filtered[index - 1].group !== cmd.group) {
      items.push({ kind: "header", group: cmd.group });
    }
    items.push({ kind: "cmd", cmd, index });
  });

  return (
    <div className="fixed inset-0 z-50" onKeyDown={onKeyDown}>
      <div className="absolute inset-0 bg-black/10" onClick={onClose} />
      <div className="glass bg-popover/95 absolute top-[15vh] left-1/2 w-[30rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 overflow-hidden rounded-2xl border shadow-2xl">
        <div className="border-border/60 flex items-center gap-2 border-b px-3">
          <SearchIcon className="text-muted-foreground size-4 shrink-0" />
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            placeholder="搜索命令…"
            aria-label="搜索命令"
            className="placeholder:text-muted-foreground h-11 w-full bg-transparent text-sm outline-none"
          />
          <kbd className="text-muted-foreground border-border/70 rounded-md border px-1.5 py-0.5 text-[10px] font-mono">
            Esc
          </kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-1.5">
          {filtered.length === 0 ? (
            <p className="text-muted-foreground px-3 py-6 text-center text-sm">
              没有匹配的命令
            </p>
          ) : (
            items.map((item) =>
              item.kind === "header" ? (
                <p
                  key={`header-${item.group}`}
                  className="text-muted-foreground/70 px-2.5 pt-2 pb-1 text-[11px] font-medium"
                >
                  {item.group}
                </p>
              ) : (
                <button
                  key={item.cmd.id}
                  type="button"
                  onMouseEnter={() => setActiveIndex(item.index)}
                  onClick={() => item.cmd.run()}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-start text-sm transition-colors",
                    item.index === activeIndex
                      ? "bg-primary/10 text-foreground shadow-inset-primary"
                      : "text-muted-foreground",
                  )}
                >
                  <span className="text-muted-foreground shrink-0">
                    {item.cmd.icon}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {item.cmd.label}
                    {item.cmd.hint ? (
                      <span className="text-muted-foreground/70 ms-2 text-xs">
                        {item.cmd.hint}
                      </span>
                    ) : null}
                  </span>
                  {item.cmd.current ? (
                    <CheckIcon className="text-primary size-3.5 shrink-0" />
                  ) : null}
                </button>
              ),
            )
          )}
        </div>
      </div>
    </div>
  );
}
