use anchor_lang::prelude::*;

use crate::constants::{AGENT_SEED, PLATFORM_AUTHORITY};
use crate::errors::BasiraError;
use crate::state::{AgentAccount, AgentStatus};

/// `register_agent` no longer requires the agent to sign. Agents are off-chain
/// entities; making them custody a Solana keypair just to create their
/// reputation PDA was a barrier to onboarding. The platform authority — the
/// same keypair the daemon uses for auto-release sweeps and submit_deliverable
/// — signs and pays on the agent's behalf. The agent wallet is passed as an
/// argument and used both for the PDA seed and as `agent.wallet`.
#[derive(Accounts)]
#[instruction(agent_wallet: Pubkey)]
pub struct RegisterAgent<'info> {
    #[account(mut, address = PLATFORM_AUTHORITY @ BasiraError::NotPlatformAuthority)]
    pub platform_authority: Signer<'info>,

    #[account(
        init,
        payer = platform_authority,
        space = 8 + AgentAccount::INIT_SPACE,
        seeds = [AGENT_SEED, agent_wallet.as_ref()],
        bump,
    )]
    pub agent_account: Account<'info, AgentAccount>,

    pub system_program: Program<'info, System>,
}

pub fn register_agent_handler(ctx: Context<RegisterAgent>, agent_wallet: Pubkey) -> Result<()> {
    let agent = &mut ctx.accounts.agent_account;
    let clock = Clock::get()?;

    agent.wallet = agent_wallet;
    agent.registered_at = clock.unix_timestamp;
    agent.completed_count = 0;
    agent.disputed_count = 0;
    agent.status = AgentStatus::Active;
    agent.bump = ctx.bumps.agent_account;

    Ok(())
}
