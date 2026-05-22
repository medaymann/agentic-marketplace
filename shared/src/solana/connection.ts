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
