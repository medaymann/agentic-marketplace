"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { ChevronDown, User, Copy, LogOut, Check } from "lucide-react";
import { Button } from "../ui/button";
import { shortenWallet } from "@/lib/format";
import { queryKeys, fetchAgentOrNull } from "@/lib/queries";

type AgentSummary = {
  wallet: string;
  name: string;
  avatar_url: string | null;
};

function WalletConnectInner() {
  const { publicKey, disconnect, connecting } = useWallet();
  const { setVisible } = useWalletModal();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const address = publicKey?.toBase58() ?? null;

  const { data } = useQuery({
    queryKey: queryKeys.agentByWallet(address ?? ""),
    queryFn: () => fetchAgentOrNull<{ agent: AgentSummary }>(address!),
    enabled: Boolean(address),
    staleTime: 60_000,
  });
  const agent = data?.agent ?? null;

  // Close the menu on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!address) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setVisible(true)}
        disabled={connecting}
        className="border-border/60 text-foreground hover:bg-secondary hover:border-[#A978EB]/30"
      >
        {connecting ? "Connecting…" : "Connect wallet"}
      </Button>
    );
  }

  const copyAddress = () => {
    navigator.clipboard?.writeText(address).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border border-border bg-card/40 py-1 pl-1.5 pr-2.5 text-xs transition-colors hover:border-foreground/30"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {agent ? (
          <>
            {agent.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={agent.avatar_url}
                alt={agent.name}
                className="h-6 w-6 rounded-full object-cover ring-1 ring-[#A978EB]/40"
              />
            ) : (
              <span
                className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                style={{
                  background:
                    "radial-gradient(circle at 30% 30%, #DA5BCB 0%, #A978EB 45%, #4a2a7a 100%)",
                }}
              >
                {agent.name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="max-w-[120px] truncate font-medium text-foreground">
              {agent.name}
            </span>
          </>
        ) : (
          <>
            <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-[#34d399]" />
            <span className="font-mono text-foreground">
              {shortenWallet(address)}
            </span>
          </>
        )}
        <ChevronDown
          className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-56 origin-top-right overflow-hidden rounded-xl border border-border bg-[#0c0b14]/95 shadow-xl backdrop-blur-xl"
          style={{ animation: "step-enter 0.15s ease both" }}
        >
          {agent && (
            <div className="border-b border-border/60 px-3 py-3">
              <div className="truncate text-sm font-medium text-foreground">
                {agent.name}
              </div>
              <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                {shortenWallet(address)}
              </div>
            </div>
          )}

          <div className="p-1.5">
            {agent && (
              <MenuItem
                icon={<User className="h-4 w-4" />}
                label="View profile"
                onClick={() => {
                  setOpen(false);
                  router.push(`/agents/${address}`);
                }}
              />
            )}
            <MenuItem
              icon={
                copied ? (
                  <Check className="h-4 w-4 text-emerald-400" />
                ) : (
                  <Copy className="h-4 w-4" />
                )
              }
              label={copied ? "Copied!" : "Copy address"}
              onClick={copyAddress}
            />
            <MenuItem
              icon={<LogOut className="h-4 w-4" />}
              label="Disconnect"
              destructive
              onClick={() => {
                setOpen(false);
                disconnect().catch(() => {});
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  destructive,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
        destructive
          ? "text-red-300 hover:bg-red-500/10"
          : "text-foreground/90 hover:bg-card hover:text-foreground"
      }`}
    >
      <span className={destructive ? "text-red-300/80" : "text-muted-foreground"}>
        {icon}
      </span>
      {label}
    </button>
  );
}

export const WalletConnect = dynamic(async () => ({ default: WalletConnectInner }), {
  ssr: false,
  loading: () => (
    <div className="h-8 w-32 rounded-md border border-border bg-card/40 animate-pulse" />
  ),
});
