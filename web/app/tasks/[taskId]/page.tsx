"use client";

import { useCallback, useEffect, useState, use } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { ArrowLeft } from "lucide-react";
import { useTxSubmit } from "@/lib/useTxSubmit";
import {
  formatAmount,
  formatDate,
  formatRelativeDeadline,
  shortenWallet,
  statusBadgeColor,
} from "@/lib/format";

type TaskDetail = {
  task: {
    task_id: string;
    title: string;
    description: string;
    acceptance_criteria: string[];
    mode: "direct" | "bounty";
    currency: "SOL" | "USDC";
    amount: string;
    status: string;
    deadline: string;
    submitted_at: string | null;
    settled_at: string | null;
    poster_wallet: string;
    assigned_agent: string | null;
    created_at: string;
    typed_inputs: Record<string, unknown> | null;
    input_schema_snapshot: { properties?: Record<string, { description?: string }> } | null;
  };
  applications: Array<{
    id: string;
    agent_wallet: string;
    message: string;
    status: string;
    created_at: string;
    agent_name: string | null;
    agent_capability_tags: string[];
    agent_joined_at: string | null;
  }>;
  deliverable: {
    content_text: string | null;
    file_urls: string[] | null;
    submitted_at: string | null;
  } | null;
  verdict: {
    verdict: "pass" | "fail" | "unavailable";
    confidence: string | null;
    reasoning: string | null;
    failed_criteria: string[] | null;
  } | null;
  dispute: {
    reason: string | null;
    agent_response: string | null;
    ruling: string | null;
    opened_at: string | null;
  } | null;
  settlements: Array<{
    kind: string;
    recipientWallet: string;
    currency: string;
    amount: string;
    txSignature: string;
    createdAt: string;
  }>;
};

export default function TaskDetailPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = use(params);
  const { publicKey } = useWallet();
  const [data, setData] = useState<TaskDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const { submitFromBase64 } = useTxSubmit();

  const wallet = publicKey?.toBase58() ?? null;

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`/api/v1/tasks/${taskId}`, { cache: "no-store" });
      if (!r.ok) throw new Error((await r.json()).error?.message ?? "Failed to load");
      setData(await r.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [taskId]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, [refresh]);

  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <Link
          href="/bounties"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to bounties
        </Link>
        <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-red-300">
          {error}
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </main>
    );
  }

  const { task, applications, deliverable, verdict, dispute, settlements } = data;

  const isPoster = wallet === task.poster_wallet;
  const isAssignedAgent = wallet !== null && wallet === task.assigned_agent;

  async function withAction(fn: () => Promise<void>) {
    setActionError(null);
    setActionStatus(null);
    setActionBusy(true);
    try {
      await fn();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setActionBusy(false);
    }
  }

  async function postAndSign(path: string, headers: Record<string, string>, body?: object) {
    setActionStatus("Building transaction…");
    const init: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
    };
    if (body) init.body = JSON.stringify(body);
    const res = await fetch(path, init);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.message ?? "Request failed");
    if (json.unsignedTx) {
      setActionStatus("Sign in your wallet…");
      const sig = await submitFromBase64(json.unsignedTx);
      if (json.isApprove) {
        await fetch(`/api/v1/tasks/${json.taskId ?? taskId}/confirm-settlement`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ txSignature: sig }),
        });
      }
      setActionStatus("Confirmed");
    } else {
      setActionStatus("Done");
    }
    await refresh();
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12 space-y-6">
      <Link
        href="/bounties"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back to bounties
      </Link>

      <div className="rounded-2xl border border-border bg-card/40 p-6 backdrop-blur-sm">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`text-xs px-2 py-0.5 rounded border ${statusBadgeColor(task.status)}`}
              >
                {task.status}
              </span>
              <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                {task.mode} mode
              </span>
              {isPoster && (
                <span className="font-mono text-[11px] uppercase tracking-wider" style={{ color: "#A978EB" }}>
                  · you posted this
                </span>
              )}
              {isAssignedAgent && (
                <span className="font-mono text-[11px] uppercase tracking-wider" style={{ color: "#A978EB" }}>
                  · assigned to you
                </span>
              )}
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">{task.title}</h1>
          </div>
          <div className="text-right">
            <div className="font-mono text-2xl font-semibold text-transparent bg-clip-text bg-gradient-to-r from-[#A978EB] to-[#DA5BCB]">
              {formatAmount(task.amount, task.currency)}
            </div>
            <div className="mt-1 font-mono text-xs text-muted-foreground">
              {formatRelativeDeadline(task.deadline)}
            </div>
          </div>
        </div>

        <p className="mt-4 whitespace-pre-wrap text-sm text-foreground/90 leading-relaxed">
          {task.description}
        </p>

        <div className="mt-6 grid grid-cols-2 gap-4 border-t border-border pt-5 text-sm">
          <Meta label="Poster" value={shortenWallet(task.poster_wallet)} />
          <Meta label="Assigned agent" value={shortenWallet(task.assigned_agent)} />
          <Meta label="Created" value={formatDate(task.created_at)} />
          <Meta label="Deadline" value={formatDate(task.deadline)} />
        </div>
      </div>

      {task.typed_inputs && Object.keys(task.typed_inputs).length > 0 && (
        <Section title="Agent inputs">
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            {Object.entries(task.typed_inputs).map(([k, v]) => {
              const desc =
                task.input_schema_snapshot?.properties?.[k]?.description ?? null;
              return (
                <div
                  key={k}
                  className="rounded-md border border-border/60 bg-card/40 p-3"
                >
                  <dt className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                    {k}
                    {desc ? <span className="ml-2 normal-case text-[10px] text-muted-foreground/70">{desc}</span> : null}
                  </dt>
                  <dd className="mt-1 break-all font-mono text-sm text-foreground/90">
                    {v === null || v === undefined
                      ? "—"
                      : typeof v === "object"
                        ? JSON.stringify(v)
                        : String(v)}
                  </dd>
                </div>
              );
            })}
          </dl>
        </Section>
      )}

      <Section title="Acceptance criteria">
        <ol className="list-decimal list-inside space-y-2 text-sm text-foreground/90">
          {task.acceptance_criteria.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ol>
      </Section>

      <ActionPanel
        wallet={wallet}
        isPoster={isPoster}
        isAssignedAgent={isAssignedAgent}
        task={task}
        applications={applications}
        verdict={verdict}
        busy={actionBusy}
        status={actionStatus}
        error={actionError}
        onApply={(msg) =>
          withAction(() =>
            postAndSign(
              `/api/v1/bounties/${task.task_id}/apply`,
              { "X-Agent-Wallet": wallet! },
              { message: msg },
            ),
          )
        }
        onAccept={(applicationId) =>
          withAction(() =>
            postAndSign(
              `/api/v1/bounties/${task.task_id}/accept`,
              { "X-Poster-Wallet": wallet! },
              { applicationId },
            ),
          )
        }
        onSubmit={(contentText) =>
          withAction(() =>
            postAndSign(
              `/api/v1/tasks/${task.task_id}/submit`,
              { "X-Agent-Wallet": wallet! },
              { contentText },
            ),
          )
        }
        onApprove={() =>
          withAction(() =>
            postAndSign(`/api/v1/tasks/${task.task_id}/approve`, {
              "X-Poster-Wallet": wallet!,
            }),
          )
        }
        onDispute={(reason) =>
          withAction(() =>
            postAndSign(
              `/api/v1/tasks/${task.task_id}/dispute`,
              { "X-Poster-Wallet": wallet! },
              { reason },
            ),
          )
        }
        onRunJudge={() =>
          withAction(async () => {
            setActionStatus("Calling Gemini…");
            const res = await fetch(`/api/v1/tasks/${task.task_id}/run-judge`, {
              method: "POST",
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error?.message ?? "Judge failed");
            setActionStatus("Verdict in");
            await refresh();
          })
        }
      />

      {task.mode === "bounty" && applications.length > 0 && (
        <Section title={`Applications (${applications.length})`}>
          <div className="space-y-3">
            {applications.map((a) => (
              <div key={a.id} className="rounded-lg border border-border bg-card/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-foreground">
                        {a.agent_name ?? shortenWallet(a.agent_wallet)}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded border ${statusBadgeColor(a.status)}`}
                      >
                        {a.status}
                      </span>
                    </div>
                    <span className="font-mono text-xs text-muted-foreground">
                      {shortenWallet(a.agent_wallet)}
                    </span>
                    {a.agent_capability_tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {a.agent_capability_tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-md border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="mt-3 text-sm italic text-foreground/90">&ldquo;{a.message}&rdquo;</p>
                  </div>
                  {isPoster && task.status === "created" && a.status === "pending" && (
                    <button
                      onClick={() =>
                        withAction(() =>
                          postAndSign(
                            `/api/v1/bounties/${task.task_id}/accept`,
                            { "X-Poster-Wallet": wallet! },
                            { applicationId: a.id },
                          ),
                        )
                      }
                      disabled={actionBusy}
                      className="bg-brand-gradient shrink-0 rounded-md px-3 py-1.5 text-xs font-medium text-white shadow-violet/20 transition-all duration-200 hover:scale-105 disabled:opacity-40"
                    >
                      Accept
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {deliverable && (
        <Section title="Deliverable">
          {deliverable.content_text && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                  content.csv
                </span>
                <a
                  href={`data:text/csv;charset=utf-8,${encodeURIComponent(deliverable.content_text)}`}
                  download="deliverable.csv"
                  className="rounded-md border border-border bg-card/60 px-3 py-1 text-xs font-medium text-foreground transition-colors hover:border-foreground/30"
                >
                  Download CSV
                </a>
              </div>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-card/60 p-3 text-sm text-foreground/90">
                {deliverable.content_text}
              </pre>
            </div>
          )}
          {deliverable.file_urls && deliverable.file_urls.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm">
              {deliverable.file_urls.map((u) => (
                <li key={u}>
                  <a
                    href={u}
                    target="_blank"
                    rel="noreferrer"
                    className="text-transparent bg-clip-text bg-gradient-to-r from-[#A978EB] to-[#DA5BCB] hover:underline"
                  >
                    {u}
                  </a>
                </li>
              ))}
            </ul>
          )}
          {deliverable.submitted_at && (
            <p className="mt-2 font-mono text-[11px] text-muted-foreground">
              Submitted {formatDate(deliverable.submitted_at)}
            </p>
          )}
        </Section>
      )}

      {verdict && (
        <Section title="AI judge verdict">
          <div className="mb-2 flex items-center gap-2">
            <span
              className={`px-3 py-1 rounded text-sm font-semibold uppercase ${
                verdict.verdict === "pass"
                  ? "bg-emerald-500/20 text-emerald-300"
                  : verdict.verdict === "fail"
                  ? "bg-red-500/20 text-red-300"
                  : "bg-gray-500/20 text-gray-300"
              }`}
            >
              {verdict.verdict}
            </span>
            {verdict.confidence && (
              <span className="font-mono text-xs text-muted-foreground">
                confidence {(Number(verdict.confidence) * 100).toFixed(0)}%
              </span>
            )}
          </div>
          {verdict.reasoning && (
            <p className="whitespace-pre-wrap text-sm text-foreground/90">{verdict.reasoning}</p>
          )}
        </Section>
      )}

      {dispute && (
        <Section title="Dispute">
          <p className="text-sm text-foreground/90">
            <span className="text-muted-foreground">Poster:</span> {dispute.reason}
          </p>
          {dispute.agent_response && (
            <p className="mt-2 text-sm text-foreground/90">
              <span className="text-muted-foreground">Agent response:</span> {dispute.agent_response}
            </p>
          )}
          {dispute.ruling && (
            <p className="mt-2 text-sm">
              <span className="text-muted-foreground">Ruling:</span>{" "}
              <span className="font-semibold capitalize">{dispute.ruling}</span>
            </p>
          )}
        </Section>
      )}

      {settlements && settlements.length > 0 && (
        <Section title="On-chain settlements">
          <div className="space-y-3">
            {settlements.map((s) => (
              <div
                key={s.txSignature + s.kind}
                className="rounded-lg border border-border bg-card/40 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground mr-2">
                      {s.kind}
                    </span>
                    <span className="font-mono text-sm text-foreground">
                      {s.recipientWallet.slice(0, 6)}…{s.recipientWallet.slice(-4)}
                    </span>
                  </div>
                  <span className="font-mono text-sm font-semibold text-emerald-300">
                    {s.currency === "SOL"
                      ? (Number(s.amount) / 1e9).toFixed(4) + " SOL"
                      : (Number(s.amount) / 1e6).toFixed(2) + " USDC"}
                  </span>
                </div>
                <a
                  href={`https://explorer.solana.com/tx/${s.txSignature}?cluster=devnet`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 block truncate font-mono text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {s.txSignature}
                </a>
              </div>
            ))}
          </div>
        </Section>
      )}
    </main>
  );
}

function ActionPanel({
  wallet,
  isPoster,
  isAssignedAgent,
  task,
  applications,
  verdict,
  busy,
  status,
  error,
  onApply,
  onSubmit,
  onApprove,
  onDispute,
  onRunJudge,
}: {
  wallet: string | null;
  isPoster: boolean;
  isAssignedAgent: boolean;
  task: TaskDetail["task"];
  applications: TaskDetail["applications"];
  verdict: TaskDetail["verdict"];
  busy: boolean;
  status: string | null;
  error: string | null;
  onApply: (message: string) => void;
  onAccept: (applicationId: string) => void;
  onSubmit: (content: string) => void;
  onApprove: () => void;
  onDispute: (reason: string) => void;
  onRunJudge: () => void;
}) {
  const [applyMsg, setApplyMsg] = useState("");
  const [deliverableText, setDeliverableText] = useState("");
  const [disputeReason, setDisputeReason] = useState("");

  if (!wallet) {
    return (
      <Section title="Actions">
        <p className="text-sm text-muted-foreground">
          Connect your wallet (header) to apply, submit a deliverable, approve, or dispute.
        </p>
      </Section>
    );
  }

  const alreadyApplied = applications.some((a) => a.agent_wallet === wallet);
  const canApply =
    task.mode === "bounty" && task.status === "created" && !isPoster && !alreadyApplied;
  const canSubmit = isAssignedAgent && task.status === "assigned";
  const canApprove = isPoster && task.status === "submitted";
  const canDispute = isPoster && task.status === "submitted";
  const canRunJudge =
    task.status === "submitted" && !verdict && (isPoster || isAssignedAgent);

  const showAny = canApply || canSubmit || canApprove || canDispute || canRunJudge;

  return (
    <Section title="Actions">
      {!showAny && (
        <p className="text-sm text-muted-foreground">
          Nothing to do here right now — task is in <code className="font-mono">{task.status}</code>{" "}
          state.
          {alreadyApplied && " You've already applied."}
        </p>
      )}

      {canApply && (
        <div className="space-y-2">
          <textarea
            value={applyMsg}
            onChange={(e) => setApplyMsg(e.target.value)}
            rows={3}
            placeholder="Why you're a good fit and what your approach will be…"
            className="form-input resize-none"
          />
          <button
            onClick={() => onApply(applyMsg)}
            disabled={busy || applyMsg.trim().length === 0}
            className="bg-brand-gradient inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white shadow-violet/20 transition-transform duration-200 hover:scale-[1.02] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Apply to bounty
          </button>
          <p className="font-mono text-[11px] text-muted-foreground">
            Requires your wallet to be a registered agent.{" "}
            <Link href="/agents/register" className="text-transparent bg-clip-text bg-gradient-to-r from-[#A978EB] to-[#DA5BCB] hover:underline">
              Register here
            </Link>
          </p>
        </div>
      )}

      {canSubmit && (
        <div className="space-y-2">
          <textarea
            value={deliverableText}
            onChange={(e) => setDeliverableText(e.target.value)}
            rows={6}
            placeholder="Inline deliverable content. For files use external URLs (R2/S3/GitHub)."
            className="form-input resize-none font-mono"
          />
          <button
            onClick={() => onSubmit(deliverableText)}
            disabled={busy || deliverableText.trim().length === 0}
            className="bg-brand-gradient inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white shadow-violet/20 transition-transform duration-200 hover:scale-[1.02] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Submit deliverable
          </button>
          <p className="font-mono text-[11px] text-muted-foreground">
            Signs an on-chain <code>submit_deliverable</code> tx and starts the 24h verification
            window. The judge runs automatically.
          </p>
        </div>
      )}

      {canApprove && (
        <div className="flex flex-wrap gap-3">
          <button
            onClick={onApprove}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:bg-emerald-800 disabled:cursor-not-allowed"
          >
            Approve & release funds
          </button>
          <div className="flex flex-1 gap-2">
            <input
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              placeholder="Reason for dispute"
              className="form-input flex-1"
            />
            {canDispute && (
              <button
                onClick={() => onDispute(disputeReason)}
                disabled={busy || disputeReason.trim().length === 0}
                className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ borderColor: "rgba(218,91,203,0.45)", color: "#DA5BCB" }}
              >
                Dispute
              </button>
            )}
          </div>
        </div>
      )}

      {canRunJudge && (
        <div className="mt-3">
          <button
            onClick={onRunJudge}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-card/60 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-foreground/30 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Run AI judge now
          </button>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            The daemon runs the judge automatically after seeing the on-chain submit event. This
            button is a manual trigger for demos.
          </p>
        </div>
      )}

      {status && (
        <div
          className="mt-3 flex items-center gap-2 rounded-md border p-3 text-sm"
          style={{ borderColor: "rgba(169,120,235,0.4)", color: "#C4A6F1", background: "rgba(169,120,235,0.05)" }}
        >
          {busy && (
            <span
              className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-t-transparent"
              style={{ borderColor: "#A978EB" }}
            />
          )}
          {status}
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </div>
      )}
    </Section>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-mono text-sm text-foreground">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card/40 p-6 backdrop-blur-sm">
      <h2 className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}
