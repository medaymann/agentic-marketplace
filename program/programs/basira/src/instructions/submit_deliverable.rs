use anchor_lang::prelude::*;

use crate::constants::{PLATFORM_AUTHORITY, TASK_SEED};
use crate::errors::BasiraError;
use crate::state::{TaskAccount, TaskStatus};

/// `submit_deliverable` no longer requires the assigned agent to sign. Agents
/// are off-chain entities; making them custody a Solana keypair just to mark
/// their work as submitted was the single biggest source of integration
/// friction. The platform authority — same keypair the daemon already uses
/// for auto-release sweeps — signs on the agent's behalf after off-chain
/// auth has verified the agent is the assigned one.
///
/// The task PDA still tracks `assigned_agent` and `status`; only the *signer*
/// of this instruction has changed.
#[derive(Accounts)]
pub struct SubmitDeliverable<'info> {
    #[account(address = PLATFORM_AUTHORITY @ BasiraError::NotPlatformAuthority)]
    pub platform_authority: Signer<'info>,

    #[account(
        mut,
        seeds = [TASK_SEED, &task_account.task_id],
        bump = task_account.bump,
    )]
    pub task_account: Account<'info, TaskAccount>,
}

pub fn submit_deliverable_handler(ctx: Context<SubmitDeliverable>) -> Result<()> {
    let task = &mut ctx.accounts.task_account;
    let now = Clock::get()?.unix_timestamp;

    require!(
        matches!(task.status, TaskStatus::Assigned),
        BasiraError::InvalidTaskStatus
    );
    require!(now < task.deadline, BasiraError::DeadlinePassed);
    require!(task.assigned_agent.is_some(), BasiraError::NotAssignedAgent);

    task.status = TaskStatus::Submitted;
    task.submitted_at = Some(now);

    Ok(())
}
