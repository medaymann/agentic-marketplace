import { Connection } from "@solana/web3.js";

let connection: Connection | null = null;

export function getConnection(): Connection {
  const rpcUrl =
    process.env["SOLANA_RPC_URL"] ?? "https://api.devnet.solana.com";
  if (connection && (connection as unknown as { rpcEndpoint: string }).rpcEndpoint === rpcUrl) {
    return connection;
  }
  connection = new Connection(rpcUrl, "confirmed");
  return connection;
}

export async function getLatestBlockhashWithRetry(retries = 3): Promise<string> {
  const conn = getConnection();
  let lastErr: unknown;
  for (let i = 0; i < retries; i++) {
    try {
      const { blockhash } = await conn.getLatestBlockhash("confirmed");
      return blockhash;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 300 * (i + 1)));
    }
  }
  throw lastErr;
}

/**
 * Confirm a signature by polling getSignatureStatus instead of opening a
 * WebSocket subscription. connection.confirmTransaction() relies on the `ws`
 * library's native `bufferutil` addon, which is absent/broken on some Node
 * builds (e.g. Node 24) and throws `bufferUtil.mask is not a function`. Polling
 * over plain HTTP RPC avoids that entirely. Throws if the tx errors on-chain or
 * the timeout elapses.
 */
export async function confirmSignatureByPolling(
  signature: string,
  { timeoutMs = 60_000, intervalMs = 1_000 } = {},
): Promise<void> {
  const conn = getConnection();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { value } = await conn.getSignatureStatus(signature, {
      searchTransactionHistory: true,
    });
    if (value) {
      if (value.err) {
        throw new Error(
          `Transaction ${signature} failed on-chain: ${JSON.stringify(value.err)}`,
        );
      }
      const status = value.confirmationStatus;
      if (status === "confirmed" || status === "finalized") return;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Timed out confirming transaction ${signature}`);
}
