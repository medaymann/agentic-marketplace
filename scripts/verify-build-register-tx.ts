/**
 * Smoke-test for /api/v1/agents/build-register-tx
 *
 * Exercises the same code paths the route uses:
 *  - random unfunded wallet  → insufficient_funds error
 *  - random funded wallet    → unsigned VersionedTransaction returned (we deserialize + check accounts)
 *  - already-registered wallet → alreadyRegistered=true
 *
 * Run:  npx tsx scripts/verify-build-register-tx.ts
 */
import * as dotenv from "dotenv";
import path from "node:path";
import fs from "node:fs";
import { Keypair, PublicKey, VersionedTransaction, Connection } from "@solana/web3.js";
import {
  agentPda,
  buildRegisterAgentTx,
  getConnection,
  getLatestBlockhashWithRetry,
  getProgram,
} from "../shared/src/solana/index.js";

dotenv.config({ path: path.join(process.cwd(), ".env") });

// Mirror of the route handler's logic.
async function buildRegisterTx(walletStr: string) {
  let walletPk: PublicKey;
  try {
    walletPk = new PublicKey(walletStr);
  } catch {
    return { status: 400, body: { error: { code: "validation_error" } } };
  }
  const connection = getConnection();
  const [agentAccount] = agentPda(walletPk);
  const existing = await connection.getAccountInfo(agentAccount);
  if (existing) {
    return { status: 200, body: { alreadyRegistered: true, agentAccount: agentAccount.toBase58() } };
  }
  const balance = await connection.getBalance(walletPk);
  if (balance === 0) {
    return {
      status: 400,
      body: { error: { code: "insufficient_funds", message: "0 SOL" } },
    };
  }
  const blockhash = await getLatestBlockhashWithRetry();
  const program = getProgram(connection);
  const { tx } = await buildRegisterAgentTx({
    wallet: walletPk,
    payer: walletPk,
    recentBlockhash: blockhash,
    program,
  });
  return {
    status: 200,
    body: {
      alreadyRegistered: false,
      agentAccount: agentAccount.toBase58(),
      unsignedTx: Buffer.from(tx.serialize()).toString("base64"),
    },
  };
}

function ok(label: string) {
  console.log(`  \x1b[32m✓\x1b[0m ${label}`);
}
function fail(label: string, why: string): never {
  console.log(`  \x1b[31m✗\x1b[0m ${label}: ${why}`);
  process.exit(1);
}

async function main() {
  console.log("Verifying build-register-tx logic against devnet…\n");
  const rpc = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
  console.log("RPC:", rpc);

  // --- Case 1: invalid pubkey
  console.log("\n[1] Invalid pubkey input");
  const r1 = await buildRegisterTx("not-a-key");
  if (r1.status !== 400) fail("expected 400 on bad pubkey", `got ${r1.status}`);
  ok("rejected with 400");

  // --- Case 2: random unfunded wallet → insufficient_funds
  console.log("\n[2] Unfunded random wallet");
  const fresh = Keypair.generate();
  const r2 = await buildRegisterTx(fresh.publicKey.toBase58());
  if (r2.status !== 400) fail("expected 400 on 0-SOL wallet", `got ${r2.status}`);
  // @ts-expect-error narrow
  if (r2.body.error?.code !== "insufficient_funds")
    fail("expected insufficient_funds code", JSON.stringify(r2.body));
  ok("rejected with insufficient_funds");

  // --- Case 3: funded wallet → unsigned tx returned, sign + broadcast works
  console.log("\n[3] Funded wallet (uses keypairs/agent.json if it exists & is funded)");
  const KP = path.join(process.cwd(), "keypairs", "agent.json");
  if (!fs.existsSync(KP)) {
    console.log("  ⚠ no keypairs/agent.json — skipping live build/sign test");
  } else {
    const secret = JSON.parse(fs.readFileSync(KP, "utf-8"));
    const kp = Keypair.fromSecretKey(new Uint8Array(secret));
    const connection: Connection = getConnection();
    const bal = await connection.getBalance(kp.publicKey);
    console.log(`  wallet=${kp.publicKey.toBase58()}  balance=${bal / 1e9} SOL`);

    if (bal === 0) {
      console.log("  ⚠ agent keypair has 0 SOL — skipping broadcast. Fund at faucet.solana.com");
    } else {
      const [pda] = agentPda(kp.publicKey);
      const existed = await connection.getAccountInfo(pda);

      const r3 = await buildRegisterTx(kp.publicKey.toBase58());
      if (r3.status !== 200) fail("expected 200", JSON.stringify(r3.body));

      // @ts-expect-error narrow
      if (existed && !r3.body.alreadyRegistered)
        fail("expected alreadyRegistered=true", JSON.stringify(r3.body));

      // @ts-expect-error narrow
      if (!existed && r3.body.alreadyRegistered)
        fail("expected alreadyRegistered=false for un-registered wallet", JSON.stringify(r3.body));

      if (existed) {
        ok("alreadyRegistered path returned PDA");
      } else {
        // @ts-expect-error narrow
        const txBytes = Buffer.from(r3.body.unsignedTx as string, "base64");
        const tx = VersionedTransaction.deserialize(txBytes);
        ok("unsigned tx deserializes");

        // Verify the payer matches our wallet
        const staticKeys = tx.message.staticAccountKeys.map((k) => k.toBase58());
        if (staticKeys[0] !== kp.publicKey.toBase58())
          fail("payer mismatch", `expected ${kp.publicKey.toBase58()}, got ${staticKeys[0]}`);
        ok("payer is the requesting wallet");

        // Verify the agentAccount PDA is referenced
        const [pdaExpected] = agentPda(kp.publicKey);
        if (!staticKeys.includes(pdaExpected.toBase58()))
          fail("PDA not in account keys", staticKeys.join(","));
        ok("AgentAccount PDA is referenced in the tx");

        // Sign and broadcast for real
        tx.sign([kp]);
        console.log("  broadcasting…");
        const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
        const latest = await connection.getLatestBlockhash();
        await connection.confirmTransaction({ signature: sig, ...latest }, "confirmed");
        ok(`broadcast confirmed: ${sig}`);

        // Now PDA must exist
        const after = await connection.getAccountInfo(pdaExpected);
        if (!after) fail("PDA was not created on-chain", "");
        ok("AgentAccount PDA now exists on-chain");

        // Calling the route again must return alreadyRegistered
        const r4 = await buildRegisterTx(kp.publicKey.toBase58());
        // @ts-expect-error narrow
        if (!r4.body.alreadyRegistered) fail("expected alreadyRegistered=true after success", JSON.stringify(r4.body));
        ok("second call returns alreadyRegistered=true");
      }
    }
  }

  console.log("\n\x1b[32mAll checks passed.\x1b[0m");
}

main().catch((e) => {
  console.error("\x1b[31mFAIL:\x1b[0m", e);
  process.exit(1);
});
