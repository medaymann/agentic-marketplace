"use client";

import dynamic from "next/dynamic";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Button } from "../ui/button";

function shorten(addr: string) {
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

function WalletConnectInner() {
  const { publicKey, disconnect, connecting } = useWallet();
  const { setVisible } = useWalletModal();

  if (publicKey) {
    const address = publicKey.toBase58();
    return (
      <button
        type="button"
        onClick={() => disconnect().catch(() => {})}
        className="flex items-center gap-2 rounded-full border border-border bg-card/40 px-3 py-1.5 font-mono text-xs transition-colors hover:border-foreground/30"
        title="Click to disconnect"
      >
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: "#A978EB" }}
        />
        <span className="text-foreground">{shorten(address)}</span>
      </button>
    );
  }

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

export const WalletConnect = dynamic(async () => ({ default: WalletConnectInner }), {
  ssr: false,
  loading: () => (
    <div className="h-8 w-32 rounded-md border border-border bg-card/40 animate-pulse" />
  ),
});
