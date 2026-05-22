import { Connection, PublicKey } from "@solana/web3.js";
import { daemonStateDb } from "@basira/shared";
import { getLogger } from "../log.js";
import { parseTransaction } from "./parse.js";
import { reconcileTransaction } from "./reconcile.js";
import { trackInflight, registerStopper, isStopping } from "../lifecycle.js";

interface StartListenerOptions {
  connection: Connection;
  programId: PublicKey;
}

const SIGNATURE_PAGE_LIMIT = 1000;

/**
 * Backfill: page through getSignaturesForAddress until we reach a slot <=
 * lastSeenSlot. Process oldest → newest so cursor advances monotonically.
 */
async function withRetry<T>(fn: () => Promise<T>, label: string, attempts = 3): Promise<T | null> {
  const log = getLogger();
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      log.warn({ err, attempt: i + 1, label }, "rpc call failed; retrying");
      await new Promise((r) => setTimeout(r, 1_000 * (i + 1)));
    }
  }
  log.error({ label }, "rpc call permanently failed; skipping");
  return null;
}

async function gapFill(
  connection: Connection,
  programId: PublicKey,
  lastSeenSlot: bigint,
): Promise<void> {
  const log = getLogger();
  const collected: { signature: string; slot: number }[] = [];

  let before: string | undefined;
  while (true) {
    const sigs = await withRetry(
      () =>
        connection.getSignaturesForAddress(
          programId,
          { limit: SIGNATURE_PAGE_LIMIT, ...(before ? { before } : {}) },
          "confirmed",
        ),
      "getSignaturesForAddress",
    );
    if (!sigs || sigs.length === 0) break;
    let reachedCursor = false;
    for (const s of sigs) {
      // Strict `<`, not `<=`: multiple txs can share the cursor's slot. If we
      // stopped at `<=` we'd skip any tx that landed in the same slot as the
      // last one we processed (e.g. an assign_agent sharing a slot with an
      // earlier task's tx). Re-scanning the boundary slot is safe — every
      // reconcile handler is idempotent (status-guarded), so already-processed
      // txs become no-ops.
      if (BigInt(s.slot) < lastSeenSlot) {
        reachedCursor = true;
        break;
      }
      collected.push({ signature: s.signature, slot: s.slot });
    }
    if (reachedCursor || sigs.length < SIGNATURE_PAGE_LIMIT) break;
    before = sigs[sigs.length - 1]!.signature;
  }

  // Process oldest first.
  collected.reverse();
  log.info({ count: collected.length, lastSeenSlot: lastSeenSlot.toString() }, "gap-fill scan");

  for (const { signature, slot } of collected) {
    if (isStopping()) return;
    await processSignature(connection, programId, signature, slot);
  }
}

async function processSignature(
  connection: Connection,
  programId: PublicKey,
  signature: string,
  slot: number,
): Promise<void> {
  const log = getLogger();
  try {
    const tx = await withRetry(
      () =>
        connection.getParsedTransaction(signature, {
          commitment: "confirmed",
          maxSupportedTransactionVersion: 0,
        }),
      `getParsedTransaction(${signature.slice(0, 8)})`,
    );
    if (!tx) {
      log.debug({ signature }, "tx not found, skipping");
      return;
    }
    if (tx.meta?.err) {
      log.debug({ signature, err: tx.meta.err }, "skipping failed tx");
      // Still advance cursor to avoid re-fetching.
    } else {
      const parsed = parseTransaction(tx, programId, signature);
      if (parsed && parsed.instructions.length > 0) {
        await reconcileTransaction(parsed, connection);
      }
    }
    await daemonStateDb.setLastSeenSlot(BigInt(slot));
  } catch (err) {
    log.error({ err, signature }, "processSignature failed");
  }
}

export async function startListener(opts: StartListenerOptions): Promise<void> {
  const log = getLogger();
  const { connection, programId } = opts;

  const lastSeen = await daemonStateDb.getLastSeenSlot();
  log.info({ lastSeenSlot: lastSeen.toString() }, "listener starting gap-fill");
  await gapFill(connection, programId, lastSeen);

  log.info({ programId: programId.toBase58() }, "listener subscribing to logs");
  const subId = connection.onLogs(
    programId,
    (logs, ctx) => {
      if (logs.err) return;
      const promise = processSignature(connection, programId, logs.signature, ctx.slot);
      trackInflight(promise);
    },
    "confirmed",
  );

  registerStopper(async () => {
    await connection.removeOnLogsListener(subId);
    log.info("listener unsubscribed");
  });
}
