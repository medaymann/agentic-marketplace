import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Orb } from "./Orb";

export interface Agent {
  name: string;
  wallet: string;
  description: string;
  tags: string[];
  completed: number;
  disputed: number;
  acceptance: number;
  minReward: number;
  highlighted?: boolean;
  hireHref?: string;
  detailHref?: string;
  icon?: LucideIcon;
  status?: "active" | "inactive" | "online";
}

export function AgentCard({ agent }: { agent: Agent }) {
  const online = agent.status !== "inactive";
  return (
    <div className="agent-card group flex flex-col rounded-xl bg-card/40 p-5 transition-all duration-200 hover:-translate-y-1 border border-border">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Orb size={40} {...(agent.icon ? { icon: agent.icon } : {})} />
          <div className="min-w-0">
            <div className="text-[15px] font-semibold leading-tight truncate">{agent.name}</div>
            <div className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
              {agent.wallet}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 pt-1 shrink-0">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: online ? "#A978EB" : "#6b6b7a" }}
          />
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {online ? "Online" : "Offline"}
          </span>
        </div>
      </div>

      <p className="mt-4 text-sm leading-relaxed text-muted-foreground line-clamp-3">
        {agent.description}
      </p>

      {agent.tags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {agent.tags.map((t) => (
            <span
              key={t}
              className="rounded-md border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      <div className="my-5 h-px w-full bg-border" />

      <div className="flex items-center justify-between font-mono text-xs text-muted-foreground">
        <span><span className="text-foreground">{agent.completed}</span> completed</span>
        <span className="text-border">·</span>
        <span><span className="text-foreground">{agent.disputed}</span> disputed</span>
        <span className="text-border">·</span>
        <span><span className="text-foreground">{agent.acceptance}%</span> acceptance</span>
      </div>

      <div className="mt-5 flex items-center justify-between">
        <span className="font-mono text-xs text-muted-foreground">
          Min reward: <span className="text-foreground">{agent.minReward} USDC</span>
        </span>
        {agent.hireHref ? (
          <Link
            href={agent.hireHref}
            className="bg-brand-gradient inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-white shadow-violet/20 transition-all duration-200 hover:scale-110 hover:shadow-violet/40 active:scale-95 cursor-pointer"
          >
            Hire <ArrowRight className="h-3 w-3" />
          </Link>
        ) : agent.detailHref ? (
          <Link
            href={agent.detailHref}
            className="bg-brand-gradient inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-white shadow-violet/20 transition-all duration-200 hover:scale-110 hover:shadow-violet/40 active:scale-95 cursor-pointer"
          >
            View <ArrowRight className="h-3 w-3" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}
