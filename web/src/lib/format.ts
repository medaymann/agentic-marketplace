export function formatAmount(amount: string | number | bigint, currency: "SOL" | "USDC"): string {
  const n = typeof amount === "bigint" ? amount : BigInt(amount.toString());
  if (currency === "SOL") {
    return `${(Number(n) / 1e9).toFixed(3)} SOL`;
  }
  return `${(Number(n) / 1e6).toFixed(2)} USDC`;
}

export function formatDate(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelativeDeadline(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const diff = date.getTime() - Date.now();
  if (diff < 0) return "expired";
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return `${Math.floor(diff / (1000 * 60))}m left`;
  if (hours < 24) return `${hours}h left`;
  const days = Math.floor(hours / 24);
  return `${days}d left`;
}

export function shortenWallet(wallet: string | null | undefined): string {
  if (!wallet) return "—";
  return `${wallet.slice(0, 4)}…${wallet.slice(-4)}`;
}

export function statusBadgeColor(status: string): string {
  const map: Record<string, string> = {
    created: "bg-blue-500/20 text-blue-300 border-blue-500/40",
    assigned: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
    submitted: "bg-purple-500/20 text-purple-300 border-purple-500/40",
    approved: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
    settled: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
    disputed: "bg-orange-500/20 text-orange-300 border-orange-500/40",
    refunded: "bg-gray-500/20 text-gray-300 border-gray-500/40",
    expired: "bg-red-500/20 text-red-300 border-red-500/40",
  };
  return map[status] ?? "bg-gray-500/20 text-gray-300 border-gray-500/40";
}
