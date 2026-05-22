import { Keypair } from "@solana/web3.js";
import { loadKeypairFromFile } from "@basira/shared";
import { getEnv } from "./env.js";

export function loadKeeperKeypair(): Keypair {
  return loadKeypairFromFile(getEnv().KEEPER_KEYPAIR_PATH);
}

export function loadArbitratorKeypair(): Keypair {
  return loadKeypairFromFile(getEnv().ARBITRATOR_KEYPAIR_PATH);
}
