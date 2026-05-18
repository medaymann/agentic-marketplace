"use client";

import { useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { VersionedTransaction } from "@solana/web3.js";

type Status = "idle" | "signing" | "broadcasting" | "confirming" | "done" | "error";

export function useTxSubmit() {
  const { signTransaction } = useWallet();
  const { connection } = useConnection();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);

  async function submitFromBase64(base64Tx: string): Promise<string> {
    if (!signTransaction) {
      throw new Error("Wallet not connected");
    }
    try {
      setError(null);
      setStatus("signing");
      const bytes = Uint8Array.from(atob(base64Tx), (c) => c.charCodeAt(0));
      const tx = VersionedTransaction.deserialize(bytes);
      const signed = await signTransaction(tx);
      setStatus("broadcasting");
      const sig = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
      });
      setSignature(sig);
      setStatus("confirming");
      const latest = await connection.getLatestBlockhash();
      await connection.confirmTransaction(
        { signature: sig, ...latest },
        "confirmed",
      );
      setStatus("done");
      return sig;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setStatus("error");
      throw e;
    }
  }

  function reset() {
    setStatus("idle");
    setError(null);
    setSignature(null);
  }

  return { status, error, signature, submitFromBase64, reset };
}
