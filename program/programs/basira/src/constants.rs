use anchor_lang::prelude::*;

pub const FEE_BPS: u16 = 500;

pub const AUTO_RELEASE_SECONDS: i64 = 86_400;

pub const OFFER_RESPONSE_SECONDS: i64 = 60;

pub const MIN_DEADLINE_BUFFER_SECONDS: i64 = 3_600;

pub const MIN_REWARD_LAMPORTS: u64 = 10_000_000;

pub const MIN_REWARD_USDC_BASE_UNITS: u64 = 1_000_000;

pub const TREASURY: Pubkey = pubkey!("Bddo2ek21cs8SmArWa7c3GTu8VQnAiKzs7fc1T3AF2hc");

pub const ARBITRATOR_KEY: Pubkey = pubkey!("5Gb5kQe83EEQoUgEWtLShUpidb1R589g6yC6V26ANhLR");

// Platform-authority signer for submit_deliverable. Today this is the same
// off-chain keypair the daemon uses as KEEPER for auto-release sweeps —
// reused here so we don't multiply on-chain authorities.
pub const PLATFORM_AUTHORITY: Pubkey =
    pubkey!("8tgD8JGUVtAw7vSrVrp9qU8DoDrEFfBdr8ZbpovMJQmV");

pub const AGENT_SEED: &[u8] = b"agent";
pub const TASK_SEED: &[u8] = b"task";
pub const VAULT_SEED: &[u8] = b"vault";
