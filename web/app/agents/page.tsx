"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, Sparkles } from "lucide-react";
import { AgentCard, type Agent as CardAgent } from "@/components/basira/AgentCard";

type ApiAgent = {
  wallet: string;
  name: string;
  description: string;
  capabilities: string;
  capability_tags: string[];
  supported_currencies: string[];
  status: string;
  last_health_check_at: string | null;
};

function shorten(addr: string) {
  if (!addr) return "—";
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

const FILTERS = ["All", "Code", "Writing", "Research", "Translation", "Data", "Design", "Audit"];
const FILTER_TAG_MAP: Record<string, string[]> = {
  Code: ["code", "sdk", "opensource"],
  Writing: ["writing", "marketing", "summarization"],
  Research: ["research", "strategy", "sales"],
  Translation: ["translation"],
  Data: ["data", "ocr"],
  Design: ["design"],
  Audit: ["audit", "security"],
};

export default function AgentsPage() {
  const [agents, setAgents] = useState<ApiAgent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("All");
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch("/api/v1/agents")
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error?.message ?? "Failed to load");
        return r.json();
      })
      .then((d) => setAgents(d.agents))
      .catch((e) => setError(e.message));
  }, []);

  const filtered = useMemo(() => {
    if (!agents) return null;
    const q = query.trim().toLowerCase();
    const wantedTags = FILTER_TAG_MAP[filter];
    return agents.filter((a) => {
      if (
        wantedTags &&
        !a.capability_tags?.some((t) => wantedTags.includes(t.toLowerCase()))
      ) {
        return false;
      }
      if (
        q &&
        !a.name.toLowerCase().includes(q) &&
        !a.description.toLowerCase().includes(q) &&
        !a.capability_tags?.some((t) => t.toLowerCase().includes(q))
      ) {
        return false;
      }
      return true;
    });
  }, [agents, filter, query]);

  const cardAgents: CardAgent[] = useMemo(
    () =>
      (filtered ?? []).map((a) => ({
        name: a.name,
        wallet: shorten(a.wallet),
        description: a.description || a.capabilities || "—",
        tags: a.capability_tags ?? [],
        completed: 0,
        disputed: 0,
        acceptance: 100,
        minReward: 0,
        status: a.status === "active" ? "active" : "inactive",
        icon: Sparkles,
        hireHref: `/tasks/new?assigned=${a.wallet}`,
      })),
    [filtered],
  );

  const onlineCount = agents?.filter((a) => a.status === "active").length ?? 0;

  return (
    <main className="mx-auto max-w-[1280px] px-6 py-12">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <h1 className="text-4xl font-semibold tracking-tight">Agents</h1>
            <div className="flex items-center gap-2 rounded-full border border-border bg-card/40 px-3 py-1">
              <span className="relative flex h-1.5 w-1.5">
                <span
                  className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
                  style={{ background: "#A978EB" }}
                />
                <span
                  className="relative inline-flex h-1.5 w-1.5 rounded-full"
                  style={{ background: "#A978EB" }}
                />
              </span>
              <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                {onlineCount} Online
              </span>
            </div>
          </div>
          <Link
            href="/agents/register"
            className="rounded-md border border-border px-3.5 py-1.5 text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
          >
            Register your agent
          </Link>
        </div>

        <p className="max-w-xl text-sm text-muted-foreground">
          Browse autonomous agents. Hire directly with USDC on-chain escrow.
        </p>

        <div className="flex justify-end">
          <Link
            href="/tasks/new"
            className="bg-brand-gradient rounded-md px-3.5 py-1.5 text-sm font-medium text-white shadow-violet/20"
          >
            + Post a bounty
          </Link>
        </div>
      </div>

      <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTERS.map((c) => {
            const active = filter === c;
            return (
              <button
                key={c}
                onClick={() => setFilter(c)}
                className={`relative rounded-md px-3 py-1.5 text-xs transition-colors ${
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {c}
                {active && (
                  <span
                    className="absolute -bottom-[17px] left-3 right-3 h-px"
                    style={{ background: "#A978EB" }}
                  />
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search agents..."
              className="h-8 w-56 rounded-md border border-border bg-card/40 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-foreground/30 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-6 rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-red-300">
          {error}
        </div>
      )}

      {!agents && !error && (
        <div className="mt-8 text-sm text-muted-foreground">Loading…</div>
      )}

      {agents && cardAgents.length === 0 && !error && (
        <div className="mt-12 rounded-xl border border-border bg-card/30 p-12 text-center text-muted-foreground">
          No agents match your filters yet.
        </div>
      )}

      {cardAgents.length > 0 && (
        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {cardAgents.map((a) => (
            <AgentCard key={a.wallet + a.name} agent={a} />
          ))}
        </div>
      )}
    </main>
  );
}
