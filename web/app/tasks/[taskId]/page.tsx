"use client";

import { Suspense, useCallback, useState, use } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { ArrowLeft, Check, X, Scale } from "lucide-react";
import { useTxSubmit } from "@/lib/useTxSubmit";
import { EscrowJourney } from "@/components/basira/EscrowJourney";
import { Collapsible } from "@/components/basira/Collapsible";
import { queryKeys, fetchTaskDetail, tasksRoot } from "@/lib/queries";
import {
  formatAmount,
  formatBytes,
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
    files:
      | Array<{
          key: string;
          name: string;
          contentType: string;
          sizeBytes: number;
          sha256: string;
          finalUrl: string;
        }>
      | null;
    external_links: Array<{ url: string; label?: string }> | null;
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

type Deliverable = NonNullable<TaskDetail["deliverable"]>;
type Verdict = TaskDetail["verdict"];

export default function TaskDetailPage({ params }: { params: Promise<{ taskId: string }> }) {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-3xl px-6 py-12">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </main>
      }
    >
      <TaskDetailInner params={params} />
    </Suspense>
  );
}

function TaskDetailInner({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = use(params);
  const { publicKey } = useWallet();
  const searchParams = useSearchParams();
  const justFunded = searchParams?.get("funded") === "1";
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const { submitFromBase64 } = useTxSubmit();

  const wallet = publicKey?.toBase58() ?? null;

  // Live poll every 4s while the tab is visible (refetchIntervalInBackground:
  // false pauses it on hidden tabs).
  const { data, error: queryError } = useQuery({
    queryKey: queryKeys.taskDetail(taskId),
    queryFn: () => fetchTaskDetail<TaskDetail>(taskId),
    refetchInterval: 4000,
    refetchIntervalInBackground: false,
  });
  const error = queryError ? (queryError as Error).message : null;

  // After a mutation, refresh this task and any task/bounty lists that may now
  // be stale (dashboard, bounties) so the user never needs a manual reload.
  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.taskDetail(taskId) });
    await queryClient.invalidateQueries({ queryKey: tasksRoot });
    await queryClient.invalidateQueries({ queryKey: ["bounties"] });
  }, [queryClient, taskId]);

  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to dashboard
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

  // What stage is the user really at? The page renders ONE primary panel for
  // the current stage; everything else demotes to collapsibles below, so the
  // user always sees what matters now instead of a growing stack.
  const settled = task.status === "settled";
  const hasDeliverable = Boolean(deliverable);
  // "review" merges delivery + the auto-run judge verdict into one decision
  // surface. Before anything is delivered we're "waiting"; after settlement,
  // "settled".
  const stage: "waiting" | "review" | "settled" = settled
    ? "settled"
    : hasDeliverable
      ? "review"
      : "waiting";
  // The brief is the focus only while waiting; once work arrives it's reference.
  const briefOpen = stage === "waiting";

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
      credentials: "include",
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

  // Bounty tasks come from the bounties board; direct tasks come from the
  // dashboard. Point the back link wherever the user actually came from.
  const backHref = task.mode === "bounty" ? "/bounties" : "/dashboard";
  const backLabel = task.mode === "bounty" ? "Back to bounties" : "Back to dashboard";

  return (
    <main className="mx-auto max-w-3xl px-6 py-12 space-y-6">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> {backLabel}
      </Link>

      <EscrowJourney
        status={task.status}
        currency={task.currency}
        amount={task.amount}
        verdict={verdict?.verdict ?? null}
        hasDeliverable={Boolean(deliverable)}
        justFunded={justFunded}
      />

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

      {/* ── Primary stage panel ─────────────────────────────────────── */}
      {stage === "review" && deliverable && (
        <ReviewPanel
          deliverable={deliverable}
          verdict={verdict}
          taskId={task.task_id}
        />
      )}

      {stage === "settled" && (
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.06] p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-400">
              <Check className="h-5 w-5" />
            </span>
            <div>
              <p className="text-lg font-semibold text-foreground">Task settled</p>
              <p className="text-sm text-muted-foreground">
                {formatAmount(task.amount, task.currency)} released from escrow to
                the agent.
              </p>
            </div>
          </div>
        </div>
      )}

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
            postAndSign(`/api/v1/bounties/${task.task_id}/apply`, {}, { message: msg }),
          )
        }
        onAccept={(applicationId) =>
          withAction(() =>
            postAndSign(`/api/v1/bounties/${task.task_id}/accept`, {}, { applicationId }),
          )
        }
        onSubmit={(contentText, files, externalLinks) =>
          withAction(() =>
            postAndSign(
              `/api/v1/tasks/${task.task_id}/submit`,
              {},
              { contentText, files, externalLinks },
            ),
          )
        }
        onApprove={() =>
          withAction(() =>
            postAndSign(`/api/v1/tasks/${task.task_id}/approve`, {}),
          )
        }
        onDispute={(reason) =>
          withAction(() =>
            postAndSign(`/api/v1/tasks/${task.task_id}/dispute`, {}, { reason }),
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

      <Collapsible title="The brief" defaultOpen={briefOpen}>
        <div className="space-y-5">
          <div>
            <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              Acceptance criteria
            </p>
            <ol className="list-decimal list-inside space-y-2 text-sm text-foreground/90">
              {task.acceptance_criteria.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ol>
          </div>

          {task.typed_inputs && Object.keys(task.typed_inputs).length > 0 && (
            <div>
              <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                Agent inputs
              </p>
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
                        {desc ? (
                          <span className="ml-2 normal-case text-[10px] text-muted-foreground/70">
                            {desc}
                          </span>
                        ) : null}
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
            </div>
          )}
        </div>
      </Collapsible>

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
                            {},
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

      {/* After settlement, the review (deliverable + verdict) folds into a
          history collapsible instead of staying the primary panel. */}
      {stage === "settled" && deliverable && (
        <Collapsible title="Deliverable & verdict" defaultOpen={false}>
          <ReviewBody
            deliverable={deliverable}
            verdict={verdict}
            taskId={task.task_id}
          />
        </Collapsible>
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
        <Collapsible title="On-chain settlements" defaultOpen={settled}>
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
        </Collapsible>
      )}
    </main>
  );
}

// One row in the agent's drag-drop file picker. Tracks the file from "picked"
// through "hashed → uploading → done" so the submit button can wait for every
// row to be `done` before posting.
type UploadEntry = {
  localId: string;
  name: string;
  contentType: string;
  sizeBytes: number;
  sha256?: string;
  key?: string;
  finalUrl?: string;
  progress: number; // 0..100
  status: "preparing" | "hashing" | "uploading" | "done" | "error";
  error?: string;
};

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function parseExternalLinks(text: string): Array<{ url: string; label?: string }> {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      // Format: "URL | optional label"
      const pipe = line.indexOf("|");
      if (pipe === -1) return { url: line };
      const url = line.slice(0, pipe).trim();
      const label = line.slice(pipe + 1).trim();
      return label ? { url, label } : { url };
    });
}

// The primary panel during the Review stage: the deliverable is the focus,
// with the auto-run judge verdict shown as a banner on top.
// The verdict centerpiece: an animated medallion with a confidence gauge, the
// PASS/FAIL word at scale, and the judge's reasoning. Replaces the old
// text-in-a-box treatment.
function VerdictHero({ verdict }: { verdict: NonNullable<Verdict> }) {
  const v = verdict.verdict;
  const pass = v === "pass";
  const fail = v === "fail";
  const conf =
    verdict.confidence != null ? Math.round(Number(verdict.confidence) * 100) : null;

  const accent = pass ? "#34D399" : fail ? "#F87171" : "#9aa";
  const tintBg = pass
    ? "bg-emerald-400/[0.05] border-emerald-400/25"
    : fail
      ? "bg-red-500/[0.05] border-red-500/25"
      : "border-border bg-card/40";

  // Arc geometry for the confidence gauge.
  const R = 34;
  const C = 2 * Math.PI * R;
  const target = conf != null ? C * (1 - conf / 100) : C;

  return (
    <div className={`overflow-hidden rounded-xl border ${tintBg}`}>
      <div className="flex flex-col items-center gap-4 px-6 py-7 sm:flex-row sm:items-center sm:gap-6 sm:py-6">
        {/* Medallion + confidence gauge */}
        <div className="relative flex h-24 w-24 shrink-0 items-center justify-center">
          {/* shockwave */}
          <span
            className="verdict-ring absolute h-16 w-16 rounded-full"
            style={{ background: accent, opacity: 0.5 }}
          />
          {/* confidence arc */}
          <svg className="absolute inset-0 -rotate-90" viewBox="0 0 80 80">
            <circle
              cx="40"
              cy="40"
              r={R}
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              className="text-border"
            />
            {conf != null && (
              <circle
                cx="40"
                cy="40"
                r={R}
                fill="none"
                stroke={accent}
                strokeWidth="4"
                strokeLinecap="round"
                className="conf-arc"
                style={
                  {
                    strokeDasharray: C,
                    strokeDashoffset: target,
                    ["--conf-start" as string]: `${C}`,
                    ["--conf-end" as string]: `${target}`,
                  } as React.CSSProperties
                }
              />
            )}
          </svg>
          {/* center icon */}
          <span
            className={`verdict-pop flex h-14 w-14 items-center justify-center rounded-full ${
              pass
                ? "bg-emerald-400/15 verdict-breathe-pass"
                : fail
                  ? "bg-red-500/15 verdict-breathe-fail"
                  : "bg-card"
            }`}
          >
            {pass ? (
              <Check className="h-7 w-7 text-emerald-400" strokeWidth={2.5} />
            ) : fail ? (
              <X className="h-7 w-7 text-red-400" strokeWidth={2.5} />
            ) : (
              <Scale className="h-6 w-6 text-muted-foreground" />
            )}
          </span>
        </div>

        {/* Verdict word + confidence label */}
        <div className="min-w-0 text-center sm:text-left">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            AI judge
          </p>
          <p
            className="verdict-pop mt-1 text-3xl font-semibold tracking-tight"
            style={{ color: accent }}
          >
            {pass ? "Passed" : fail ? "Failed" : "Unavailable"}
          </p>
          {conf != null && (
            <p className="conf-rise mt-1 font-mono text-xs text-muted-foreground">
              <span className="tabular-nums text-foreground">{conf}%</span>{" "}
              confidence
            </p>
          )}
        </div>
      </div>

      {/* Reasoning */}
      {verdict.reasoning && (
        <div className="verdict-line-rise border-t border-border/60 px-6 py-4">
          <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Reasoning
          </p>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
            {verdict.reasoning}
          </p>
        </div>
      )}

      {/* Failed criteria */}
      {verdict.failed_criteria && verdict.failed_criteria.length > 0 && (
        <div className="verdict-line-rise border-t border-border/60 px-6 py-4">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Unmet criteria ({verdict.failed_criteria.length})
          </p>
          <ul className="space-y-1.5">
            {verdict.failed_criteria.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-red-300">
                <X className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ReviewPanel({
  deliverable,
  verdict,
  taskId,
}: {
  deliverable: Deliverable;
  verdict: Verdict;
  taskId: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card/40">
      <div className="flex items-center justify-between gap-3 border-b border-border px-6 py-3.5">
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
          Review deliverable
        </span>
        {!verdict && (
          <span className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#A978EB]" />
            judging…
          </span>
        )}
      </div>
      <div className="px-6 py-5">
        <ReviewBody deliverable={deliverable} verdict={verdict} taskId={taskId} />
      </div>
    </div>
  );
}


// Shared deliverable + verdict-reasoning content. Used both as the primary
// review panel body and (collapsed) in the settled-history section.
function ReviewBody({
  deliverable,
  verdict,
  taskId,
}: {
  deliverable: Deliverable;
  verdict: Verdict;
  taskId: string;
}) {
  return (
    <div className="space-y-5">
      {verdict && <VerdictHero verdict={verdict} />}

      {deliverable.content_text && (
        <div>
          <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            Write-up
          </p>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-card/60 p-3 text-sm text-foreground/90">
            {deliverable.content_text}
          </pre>
        </div>
      )}

      {deliverable.files && deliverable.files.length > 0 && (
        <div>
          <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            Files ({deliverable.files.length})
          </p>
          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-card/60 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Size</th>
                  <th className="px-3 py-2">sha256</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {deliverable.files.map((f) => (
                  <tr key={f.key} className="border-t border-border/60">
                    <td className="px-3 py-2 font-mono text-xs">{f.name}</td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                      {formatBytes(f.sizeBytes)}
                    </td>
                    <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">
                      {f.sha256.slice(0, 12)}…
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={async () => {
                          const res = await fetch(
                            `/api/v1/tasks/${taskId}/deliverable/download-url`,
                            {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              credentials: "include",
                              body: JSON.stringify({ key: f.key }),
                            },
                          );
                          const json = await res.json();
                          if (!res.ok) {
                            alert(json.error?.message ?? "Download failed");
                            return;
                          }
                          window.open(json.url, "_blank", "noopener,noreferrer");
                        }}
                        className="rounded-md border border-border bg-card/60 px-3 py-1 text-xs font-medium transition-colors hover:border-foreground/30"
                      >
                        Download
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {deliverable.external_links && deliverable.external_links.length > 0 && (
        <div>
          <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            External links
          </p>
          <ul className="space-y-1 text-sm">
            {deliverable.external_links.map((l) => (
              <li key={l.url}>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#c8a8f5] underline-offset-4 hover:underline"
                >
                  {l.label ? `${l.label} — ${l.url}` : l.url}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {deliverable.submitted_at && (
        <p className="font-mono text-[11px] text-muted-foreground">
          Submitted {formatDate(deliverable.submitted_at)}
        </p>
      )}
    </div>
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
  onSubmit: (
    content: string,
    files: Array<{
      key: string;
      name: string;
      contentType: string;
      sizeBytes: number;
      sha256: string;
    }>,
    externalLinks: Array<{ url: string; label?: string }>,
  ) => void;
  onApprove: () => void;
  onDispute: (reason: string) => void;
  onRunJudge: () => void;
}) {
  const [applyMsg, setApplyMsg] = useState("");
  const [deliverableText, setDeliverableText] = useState("");
  const [externalLinksText, setExternalLinksText] = useState("");
  const [uploads, setUploads] = useState<UploadEntry[]>([]);
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
        <div className="space-y-4">
          <div className="space-y-2">
            <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              Write-up
            </span>
            <textarea
              value={deliverableText}
              onChange={(e) => setDeliverableText(e.target.value)}
              rows={5}
              placeholder="Summary, explanation, or notes for the poster…"
              className="form-input resize-none font-mono"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                Files
              </span>
              <span className="font-mono text-[10px] text-muted-foreground/70">
                Up to 20 files, 50 MB each. Hashed on your machine; uploaded direct to storage.
              </span>
            </div>
            <input
              type="file"
              multiple
              disabled={busy}
              onChange={async (e) => {
                const fileList = e.target.files;
                if (!fileList) return;
                const picked = Array.from(fileList);
                e.currentTarget.value = ""; // allow re-picking the same file later

                for (const file of picked) {
                  const localId =
                    typeof crypto.randomUUID === "function"
                      ? crypto.randomUUID()
                      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
                  setUploads((prev) => [
                    ...prev,
                    {
                      localId,
                      name: file.name,
                      contentType: file.type || "application/octet-stream",
                      sizeBytes: file.size,
                      progress: 0,
                      status: "hashing",
                    },
                  ]);

                  try {
                    const buf = await file.arrayBuffer();
                    const sha = await sha256Hex(buf);
                    setUploads((prev) =>
                      prev.map((u) =>
                        u.localId === localId
                          ? { ...u, sha256: sha, status: "preparing" }
                          : u,
                      ),
                    );

                    const presignRes = await fetch(
                      `/api/v1/tasks/${task.task_id}/deliverable/upload-url`,
                      {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify({
                          filename: file.name,
                          contentType: file.type || "application/octet-stream",
                          sizeBytes: file.size,
                        }),
                      },
                    );
                    const presignJson = await presignRes.json();
                    if (!presignRes.ok)
                      throw new Error(
                        presignJson.error?.message ?? "Upload URL request failed",
                      );

                    setUploads((prev) =>
                      prev.map((u) =>
                        u.localId === localId
                          ? {
                              ...u,
                              key: presignJson.key,
                              finalUrl: presignJson.finalUrl,
                              status: "uploading",
                            }
                          : u,
                      ),
                    );

                    // Use XHR for progress (fetch lacks upload-progress on web).
                    await new Promise<void>((resolve, reject) => {
                      const xhr = new XMLHttpRequest();
                      xhr.open("PUT", presignJson.url);
                      if (file.type) {
                        xhr.setRequestHeader("Content-Type", file.type);
                      }
                      xhr.upload.onprogress = (ev) => {
                        if (!ev.lengthComputable) return;
                        const pct = Math.round((ev.loaded / ev.total) * 100);
                        setUploads((prev) =>
                          prev.map((u) =>
                            u.localId === localId ? { ...u, progress: pct } : u,
                          ),
                        );
                      };
                      xhr.onload = () => {
                        if (xhr.status >= 200 && xhr.status < 300) resolve();
                        else reject(new Error(`PUT failed: HTTP ${xhr.status}`));
                      };
                      xhr.onerror = () => reject(new Error("PUT network error"));
                      xhr.send(buf);
                    });

                    setUploads((prev) =>
                      prev.map((u) =>
                        u.localId === localId
                          ? { ...u, progress: 100, status: "done" }
                          : u,
                      ),
                    );
                  } catch (err) {
                    setUploads((prev) =>
                      prev.map((u) =>
                        u.localId === localId
                          ? {
                              ...u,
                              status: "error",
                              error: err instanceof Error ? err.message : String(err),
                            }
                          : u,
                      ),
                    );
                  }
                }
              }}
              className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-card/60 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-foreground hover:file:border-foreground/30"
            />

            {uploads.length > 0 && (
              <ul className="space-y-1 text-sm">
                {uploads.map((u) => (
                  <li
                    key={u.localId}
                    className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-card/40 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-xs">{u.name}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">
                        {formatBytes(u.sizeBytes)} ·{" "}
                        {u.status === "hashing"
                          ? "hashing…"
                          : u.status === "preparing"
                            ? "requesting upload URL…"
                            : u.status === "uploading"
                              ? `${u.progress}%`
                              : u.status === "done"
                                ? `sha256: ${u.sha256?.slice(0, 12)}…`
                                : `error: ${u.error}`}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setUploads((prev) => prev.filter((x) => x.localId !== u.localId))
                      }
                      disabled={busy}
                      className="rounded-md border border-border bg-card/60 px-2 py-1 text-[10px] font-mono uppercase tracking-wider transition-colors hover:border-foreground/30 disabled:opacity-40"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-2">
            <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              External links
            </span>
            <textarea
              value={externalLinksText}
              onChange={(e) => setExternalLinksText(e.target.value)}
              rows={3}
              placeholder={"One per line. Optional label after a pipe:\nhttps://example.com/demo | live demo"}
              className="form-input resize-none font-mono text-xs"
            />
          </div>

          <button
            onClick={() => {
              const readyFiles = uploads
                .filter((u) => u.status === "done" && u.key && u.sha256)
                .map((u) => ({
                  key: u.key as string,
                  name: u.name,
                  contentType: u.contentType,
                  sizeBytes: u.sizeBytes,
                  sha256: u.sha256 as string,
                }));
              const externalLinks = parseExternalLinks(externalLinksText);
              onSubmit(deliverableText, readyFiles, externalLinks);
            }}
            disabled={
              busy ||
              uploads.some((u) => u.status !== "done" && u.status !== "error") ||
              (deliverableText.trim().length === 0 &&
                uploads.filter((u) => u.status === "done").length === 0 &&
                externalLinksText.trim().length === 0)
            }
            className="bg-brand-gradient inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white shadow-violet/20 transition-transform duration-200 hover:scale-[1.02] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Submit deliverable
          </button>
          <p className="font-mono text-[11px] text-muted-foreground">
            Signs an on-chain <code>submit_deliverable</code> tx, starts the 24h
            verification window, and triggers the judge.
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
