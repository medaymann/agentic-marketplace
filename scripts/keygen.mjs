/**
 * One-shot dev keypair generator. Writes Solana CLI-compatible JSON files
 * (64-byte secret arrays) to keypairs/. Skips files that already exist.
 *
 * Run:  node scripts/keygen.mjs
 */
import { Keypair } from "@solana/web3.js";
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const KEYS_DIR = join(process.cwd(), "keypairs");
const NAMES = ["treasury", "arbitrator", "keeper"];

if (!existsSync(KEYS_DIR)) mkdirSync(KEYS_DIR, { recursive: true });

const out = {};
for (const name of NAMES) {
  const path = join(KEYS_DIR, `${name}.json`);
  if (existsSync(path)) {
    console.log(`SKIP ${name}: ${path} already exists`);
    continue;
  }
  const kp = Keypair.generate();
  writeFileSync(path, JSON.stringify(Array.from(kp.secretKey)));
  out[name] = kp.publicKey.toBase58();
  console.log(`GENERATED ${name}: ${kp.publicKey.toBase58()}`);
  console.log(`  secret saved to ${path}`);
}

if (Object.keys(out).length > 0) {
  console.log("\n--- pubkeys ---");
  for (const [k, v] of Object.entries(out)) {
    console.log(`${k.toUpperCase()}=${v}`);
  }
}
