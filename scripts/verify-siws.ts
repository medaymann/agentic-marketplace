/**
 * End-to-end verification for the SIWS auth pipeline against the real Postgres.
 *
 *  1. Build a SIWS challenge for a fresh wallet (mirrors siws-challenge route).
 *  2. Sign the challenge with the wallet's secret key.
 *  3. Call shared verifySIWS — should produce a session token + 7-day expiry.
 *  4. Look up the session by token via sessionsDb.getSession — proves the
 *     cookie that the verify response sets would resolve via requireSiws.
 *  5. Wrong-signature path → rejected.
 *  6. Replay of the same nonce → rejected.
 *  7. Delete the session — subsequent lookup returns undefined.
 *
 * Run:  npx tsx scripts/verify-siws.ts
 */
import * as dotenv from "dotenv";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import {
  buildSiwsMessage,
  sessionsDb,
  verifySIWS,
} from "../shared/src/index.js";

dotenv.config({ path: path.join(process.cwd(), ".env") });

function ok(label: string) {
  console.log(`  \x1b[32m✓\x1b[0m ${label}`);
}
function fail(label: string, why: string): never {
  console.log(`  \x1b[31m✗\x1b[0m ${label}: ${why}`);
  process.exit(1);
}

function buildChallenge(walletStr: string) {
  // Mirror the siws-challenge route: just generate, don't consume — the
  // nonce is consumed exclusively by verifySIWS.
  const nonce = randomBytes(16).toString("base64url");
  const issuedAt = new Date();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  const message = buildSiwsMessage({
    domain: "localhost",
    wallet: walletStr,
    nonce,
    issuedAt,
    expiresAt,
  });
  return { nonce, message };
}

async function main() {
  console.log("Verifying SIWS pipeline end-to-end…\n");

  const kp = Keypair.generate();
  const walletStr = kp.publicKey.toBase58();
  console.log("Fresh wallet:", walletStr);

  // ----- [1+2+3] Challenge → sign → verify → session -----
  console.log("\n[1-3] Challenge, sign, verify");
  const { message } = buildChallenge(walletStr);
  const messageBytes = new TextEncoder().encode(message);
  const sigBytes = nacl.sign.detached(messageBytes, kp.secretKey);
  const signature = bs58.encode(sigBytes);

  const result = await verifySIWS({
    message,
    signature,
    publicKey: walletStr,
  });
  if (result.wallet !== walletStr) fail("[3]", "wallet mismatch in result");
  ok(`session created: ${result.sessionToken}`);

  const ttlMs = result.expiresAt.getTime() - Date.now();
  const ttlDays = ttlMs / (1000 * 60 * 60 * 24);
  if (ttlDays < 6.9 || ttlDays > 7.1) fail("[3]", `TTL not ~7 days, got ${ttlDays.toFixed(2)} days`);
  ok(`session TTL ≈ 7 days (${ttlDays.toFixed(2)})`);

  // ----- [4] Session lookup (mirrors requireSiws) -----
  console.log("\n[4] requireSiws-shaped lookup");
  const session = await sessionsDb.getSession(result.sessionToken);
  if (!session) fail("[4]", "session not retrievable");
  if (session.kind !== "siws") fail("[4]", `wrong kind: ${session.kind}`);
  if (session.wallet !== walletStr) fail("[4]", `wallet mismatch: ${session.wallet}`);
  ok("session resolves to the correct wallet");

  // ----- [5] Wrong signature -----
  console.log("\n[5] Bad signature → rejected");
  const { message: m2 } = buildChallenge(walletStr);
  const bogus = bs58.encode(randomBytes(64));
  try {
    await verifySIWS({ message: m2, signature: bogus, publicKey: walletStr });
    fail("[5]", "expected error, got success");
  } catch (e) {
    if (e instanceof Error && e.message.toLowerCase().includes("signature")) {
      ok(`rejected: ${e.message}`);
    } else {
      fail("[5]", `unexpected: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ----- [6] Replay: same nonce, valid signature, second attempt -----
  console.log("\n[6] Nonce replay → rejected");
  const { message: m3 } = buildChallenge(walletStr);
  const sig3 = bs58.encode(
    nacl.sign.detached(new TextEncoder().encode(m3), kp.secretKey),
  );
  await verifySIWS({ message: m3, signature: sig3, publicKey: walletStr });
  // try again with the same message → nonce already consumed by the prior verify
  try {
    await verifySIWS({ message: m3, signature: sig3, publicKey: walletStr });
    fail("[6]", "replay was accepted");
  } catch (e) {
    if (e instanceof Error && e.message.toLowerCase().includes("nonce")) {
      ok(`replay rejected: ${e.message}`);
    } else {
      fail("[6]", `unexpected: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ----- [7] Delete + lookup -----
  console.log("\n[7] Logout / delete session");
  await sessionsDb.deleteSession(result.sessionToken);
  const afterDelete = await sessionsDb.getSession(result.sessionToken);
  if (afterDelete) fail("[7]", "session still present after delete");
  ok("session removed after logout");

  console.log("\n\x1b[32mAll checks passed.\x1b[0m");
  process.exit(0);
}

main().catch((e) => {
  console.error("\x1b[31mFAIL:\x1b[0m", e);
  process.exit(1);
});
