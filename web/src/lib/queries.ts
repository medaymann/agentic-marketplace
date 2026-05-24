/**
 * Single source of truth for query keys and fetchers used with TanStack Query.
 *
 * Keep keys here (not inline strings scattered across pages) so mutations can
 * invalidate by a stable, typed key — and so adding/refactoring a query touches
 * one file. Fetchers are generic over the page-local response type: each page
 * keeps owning its own row types; this layer only owns the URL + key.
 */

/** Throws the API's `error.message` on non-2xx, else returns parsed JSON. */
async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(body.error?.message ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const queryKeys = {
  agents: ["agents"] as const,
  bounties: (currency?: string) => ["bounties", currency ?? "all"] as const,
  tasksByPoster: (wallet: string) => ["tasks", "poster", wallet] as const,
  tasksByAgent: (wallet: string) => ["tasks", "agent", wallet] as const,
  taskDetail: (taskId: string) => ["tasks", "detail", taskId] as const,
  agentSchema: (wallet: string) => ["agent-schema", wallet] as const,
};

/** Prefix to invalidate every task-related query at once after a mutation. */
export const tasksRoot = ["tasks"] as const;

export function fetchAgents<T>(): Promise<T> {
  return getJson<T>("/api/v1/agents");
}

export function fetchBounties<T>(currency?: string): Promise<T> {
  const q = currency && currency !== "all" ? `?currency=${currency}` : "";
  return getJson<T>(`/api/v1/bounties${q}`);
}

export function fetchTasksByPoster<T>(wallet: string): Promise<T> {
  return getJson<T>(`/api/v1/tasks?poster=${wallet}`);
}

export function fetchTasksByAgent<T>(wallet: string): Promise<T> {
  return getJson<T>(`/api/v1/tasks?agent=${wallet}`);
}

export function fetchTaskDetail<T>(taskId: string): Promise<T> {
  return getJson<T>(`/api/v1/tasks/${taskId}`);
}
