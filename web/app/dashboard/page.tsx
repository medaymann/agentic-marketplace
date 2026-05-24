"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  formatAmount,
  formatRelativeDeadline,
  shortenWallet,
  statusBadgeColor,
} from "@/lib/format";
import {
  queryKeys,
  fetchTasksByPoster,
  fetchTasksByAgent,
} from "@/lib/queries";

type Task = {
  task_id: string;
  title: string;
  mode: "direct" | "bounty";
  currency: "SOL" | "USDC";
  amount: string;
  status: string;
  deadline: string;
  poster_wallet: string;
  assigned_agent: string | null;
};

export default function DashboardPage() {
  const { publicKey } = useWallet();
  const [wallet, setWallet] = useState("");

  const effectiveWallet = publicKey?.toBase58() ?? wallet;
  const enabled = !!effectiveWallet;

  const postedQ = useQuery({
    queryKey: queryKeys.tasksByPoster(effectiveWallet),
    queryFn: () => fetchTasksByPoster<{ tasks: Task[] }>(effectiveWallet),
    enabled,
  });
  const assignedQ = useQuery({
    queryKey: queryKeys.tasksByAgent(effectiveWallet),
    queryFn: () => fetchTasksByAgent<{ tasks: Task[] }>(effectiveWallet),
    enabled,
  });

  const posted = postedQ.data?.tasks ?? null;
  const assigned = assignedQ.data?.tasks ?? null;
  const error = postedQ.error
    ? (postedQ.error as Error).message
    : assignedQ.error
      ? (assignedQ.error as Error).message
      : null;

  return (
    <main className="mx-auto max-w-[1100px] px-6 py-12 space-y-8">
      <h1 className="text-4xl font-semibold tracking-tight">Dashboard</h1>

      {!effectiveWallet && (
        <div className="rounded-xl border border-border bg-card/40 p-6 space-y-3 backdrop-blur-sm">
          <p className="text-sm text-foreground">
            Connect your wallet to see your tasks — or paste a wallet address below.
          </p>
          <input
            value={wallet}
            onChange={(e) => setWallet(e.target.value)}
            placeholder="Base58 wallet address"
            className="form-input font-mono"
          />
        </div>
      )}

      {effectiveWallet && (
        <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
          Viewing tasks for{" "}
          <span className="text-foreground normal-case tracking-normal">
            {shortenWallet(effectiveWallet)}
          </span>
        </p>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-red-300">
          {error}
        </div>
      )}

      <TaskGroup title="Posted by you" tasks={posted} emptyHint="You haven't posted a task yet." />
      <TaskGroup
        title="Assigned to you"
        tasks={assigned}
        emptyHint="No tasks assigned to this wallet."
      />
    </main>
  );
}

function TaskGroup({
  title,
  tasks,
  emptyHint,
}: {
  title: string;
  tasks: Task[] | null;
  emptyHint: string;
}) {
  if (tasks === null) return null;
  return (
    <section>
      <h2 className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      {tasks.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-border bg-card/20 p-6 text-center text-sm text-muted-foreground">
          {emptyHint}
        </p>
      ) : (
        <div className="mt-4 space-y-2 overflow-hidden rounded-xl border border-border">
          {tasks.map((t, i) => (
            <Link
              key={t.task_id}
              href={`/tasks/${t.task_id}`}
              className={`flex items-center justify-between gap-3 bg-card/40 px-4 py-3 transition-colors hover:bg-card/70 ${
                i > 0 ? "border-t border-border" : ""
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs px-2 py-0.5 rounded border ${statusBadgeColor(t.status)}`}
                  >
                    {t.status}
                  </span>
                  <span className="text-xs text-muted-foreground capitalize">{t.mode}</span>
                </div>
                <div className="mt-1 truncate text-sm font-medium">{t.title}</div>
              </div>
              <div className="text-right whitespace-nowrap">
                <div className="font-mono text-sm font-semibold text-transparent bg-clip-text bg-gradient-to-r from-[#A978EB] to-[#DA5BCB]">
                  {formatAmount(t.amount, t.currency)}
                </div>
                <div className="font-mono text-[11px] text-muted-foreground">
                  {formatRelativeDeadline(t.deadline)}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
