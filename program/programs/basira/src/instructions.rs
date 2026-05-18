use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::state::*;
use crate::errors::BasiraError;
use crate::constants::{FEE_BPS, AUTO_RELEASE_SECONDS, pubkeys::TREASURY, pubkeys::ARBITRATOR_KEY};

#[derive(Accounts)]
pub struct RegisterAgent<'info> {
    #[account(
        init,
        payer = agent,
        space = AgentAccount::LEN,
        seeds = [b"agent", agent.key().as_ref()],
        bump
    )]
    pub agent_account: Account<'info, AgentAccount>,
    #[account(mut)]
    pub agent: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn register_agent(ctx: Context<RegisterAgent>) -> Result<()> {
    let agent_account = &mut ctx.accounts.agent_account;
    agent_account.wallet = ctx.accounts.agent.key();
    agent_account.registered_at = Clock::get()?.unix_timestamp;
    agent_account.completed_count = 0;
    agent_account.disputed_count = 0;
    agent_account.status = AgentStatus::Active;
    agent_account.bump = ctx.bumps.agent_account;
    Ok(())
}

#[derive(Accounts)]
#[instruction(task_id: [u8; 16])]
pub struct CreateTask<'info> {
    #[account(
        init,
        payer = poster,
        space = TaskAccount::LEN,
        seeds = [b"task", task_id.as_ref()],
        bump
    )]
    pub task_account: Account<'info, TaskAccount>,
    /// CHECK: Escrow vault PDA for SOL
    #[account(
        mut,
        seeds = [b"vault", task_id.as_ref()],
        bump
    )]
    pub escrow_vault: SystemAccount<'info>,
    #[account(mut)]
    pub poster: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn create_task(
    ctx: Context<CreateTask>,
    task_id: [u8; 16],
    mode: TaskMode,
    assigned_agent: Option<Pubkey>,
    currency: Currency,
    amount: u64,
    deadline: i64,
    criteria_hash: [u8; 32],
) -> Result<()> {
    require!(amount > 0, BasiraError::RewardTooSmall);
    require!(deadline > Clock::get()?.unix_timestamp + 3600, BasiraError::InvalidDeadline); // At least 1 hour

    let task_account = &mut ctx.accounts.task_account;
    task_account.task_id = task_id;
    task_account.poster_wallet = ctx.accounts.poster.key();
    task_account.assigned_agent = assigned_agent;
    task_account.mode = mode.clone();
    task_account.status = if mode == TaskMode::Direct { TaskStatus::Assigned } else { TaskStatus::Created };
    task_account.currency = currency;
    task_account.amount = amount;
    task_account.fee_bps = FEE_BPS;
    task_account.deadline = deadline;
    task_account.submitted_at = None;
    task_account.created_at = Clock::get()?.unix_timestamp;
    task_account.criteria_hash = criteria_hash;
    task_account.bump = ctx.bumps.task_account;

    // For SOL, transfer to escrow_vault
    // If it's USDC, we need a separate instruction or we just assume SOL for now,
    // The spec says: "For USDC: token account owned by program PDA".
    // We will do SOL transfer here for simplicity of the prototype, 
    // real implementation requires separate CreateTaskToken vs CreateTaskSol or dynamic accounts.
    if task_account.currency == Currency::Sol {
        let cpi_context = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.poster.to_account_info(),
                to: ctx.accounts.escrow_vault.to_account_info(),
            },
        );
        system_program::transfer(cpi_context, amount)?;
    }

    Ok(())
}

#[derive(Accounts)]
pub struct AssignAgent<'info> {
    #[account(mut, has_one = poster_wallet)]
    pub task_account: Account<'info, TaskAccount>,
    pub poster_wallet: Signer<'info>,
}

pub fn assign_agent(ctx: Context<AssignAgent>, assigned_agent: Pubkey) -> Result<()> {
    let task = &mut ctx.accounts.task_account;
    require!(task.mode == TaskMode::Bounty, BasiraError::InvalidMode);
    require!(task.status == TaskStatus::Created, BasiraError::InvalidStatus);
    
    task.assigned_agent = Some(assigned_agent);
    task.status = TaskStatus::Assigned;
    Ok(())
}

#[derive(Accounts)]
pub struct RejectAssignment<'info> {
    #[account(mut)]
    pub task_account: Account<'info, TaskAccount>,
    pub assigned_agent: Signer<'info>,
    /// CHECK: Escrow vault PDA to refund from
    #[account(mut)]
    pub escrow_vault: SystemAccount<'info>,
    /// CHECK: Poster to refund to
    #[account(mut)]
    pub poster: SystemAccount<'info>,
}

pub fn reject_assignment(ctx: Context<RejectAssignment>) -> Result<()> {
    let task = &mut ctx.accounts.task_account;
    require!(task.assigned_agent == Some(ctx.accounts.assigned_agent.key()), BasiraError::NotAssignedAgent);
    require!(task.status == TaskStatus::Assigned, BasiraError::InvalidStatus);
    require!(task.poster_wallet == ctx.accounts.poster.key(), BasiraError::Unauthorized);

    task.status = TaskStatus::Refunded;
    
    // Refund SOL
    let amount = task.amount;
    ctx.accounts.escrow_vault.sub_lamports(amount)?;
    ctx.accounts.poster.add_lamports(amount)?;

    Ok(())
}

#[derive(Accounts)]
pub struct SubmitDeliverable<'info> {
    #[account(mut)]
    pub task_account: Account<'info, TaskAccount>,
    pub assigned_agent: Signer<'info>,
}

pub fn submit_deliverable(ctx: Context<SubmitDeliverable>) -> Result<()> {
    let task = &mut ctx.accounts.task_account;
    require!(task.assigned_agent == Some(ctx.accounts.assigned_agent.key()), BasiraError::NotAssignedAgent);
    require!(task.status == TaskStatus::Assigned, BasiraError::InvalidStatus);
    require!(Clock::get()?.unix_timestamp < task.deadline, BasiraError::DeadlinePassed);

    task.status = TaskStatus::Submitted;
    task.submitted_at = Some(Clock::get()?.unix_timestamp);
    Ok(())
}

// Additional instructions: approve, claim_after_timeout, open_dispute, resolve_dispute, expire_task, cancel_task
// would follow similar patterns.

#[derive(Accounts)]
pub struct Approve<'info> {
    #[account(mut, has_one = poster_wallet)]
    pub task_account: Account<'info, TaskAccount>,
    pub poster_wallet: Signer<'info>,
    #[account(mut)]
    pub agent_account: Account<'info, AgentAccount>,
    /// CHECK: Escrow vault
    #[account(mut)]
    pub escrow_vault: SystemAccount<'info>,
    /// CHECK: Treasury
    #[account(mut)]
    pub treasury: SystemAccount<'info>,
    /// CHECK: Agent wallet
    #[account(mut)]
    pub agent: SystemAccount<'info>,
}

pub fn approve(ctx: Context<Approve>) -> Result<()> {
    let task = &mut ctx.accounts.task_account;
    require!(task.status == TaskStatus::Submitted, BasiraError::InvalidStatus);
    require!(ctx.accounts.agent_account.wallet == task.assigned_agent.unwrap(), BasiraError::Unauthorized);
    require!(ctx.accounts.agent.key() == task.assigned_agent.unwrap(), BasiraError::Unauthorized);
    require!(ctx.accounts.treasury.key() == TREASURY, BasiraError::Unauthorized);

    task.status = TaskStatus::Settled;
    ctx.accounts.agent_account.completed_count += 1;

    // Fee split 95% / 5%
    let amount = task.amount;
    let fee = (amount as u128 * task.fee_bps as u128 / 10000) as u64;
    let payout = amount - fee;

    ctx.accounts.escrow_vault.sub_lamports(amount)?;
    ctx.accounts.agent.add_lamports(payout)?;
    ctx.accounts.treasury.add_lamports(fee)?;

    Ok(())
}

#[derive(Accounts)]
pub struct ClaimAfterTimeout<'info> {
    #[account(mut)]
    pub task_account: Account<'info, TaskAccount>,
    #[account(mut)]
    pub agent_account: Account<'info, AgentAccount>,
    /// CHECK: Escrow vault
    #[account(mut)]
    pub escrow_vault: SystemAccount<'info>,
    /// CHECK: Treasury
    #[account(mut)]
    pub treasury: SystemAccount<'info>,
    /// CHECK: Agent wallet
    #[account(mut)]
    pub agent: SystemAccount<'info>,
}

pub fn claim_after_timeout(ctx: Context<ClaimAfterTimeout>) -> Result<()> {
    let task = &mut ctx.accounts.task_account;
    require!(task.status == TaskStatus::Submitted, BasiraError::InvalidStatus);
    require!(Clock::get()?.unix_timestamp >= task.submitted_at.unwrap() + AUTO_RELEASE_SECONDS, BasiraError::AutoReleaseWindowNotElapsed);
    require!(ctx.accounts.agent_account.wallet == task.assigned_agent.unwrap(), BasiraError::Unauthorized);
    require!(ctx.accounts.agent.key() == task.assigned_agent.unwrap(), BasiraError::Unauthorized);
    require!(ctx.accounts.treasury.key() == TREASURY, BasiraError::Unauthorized);

    task.status = TaskStatus::Settled;
    ctx.accounts.agent_account.completed_count += 1;

    let amount = task.amount;
    let fee = (amount as u128 * task.fee_bps as u128 / 10000) as u64;
    let payout = amount - fee;

    ctx.accounts.escrow_vault.sub_lamports(amount)?;
    ctx.accounts.agent.add_lamports(payout)?;
    ctx.accounts.treasury.add_lamports(fee)?;

    Ok(())
}

#[derive(Accounts)]
pub struct OpenDispute<'info> {
    #[account(mut)]
    pub task_account: Account<'info, TaskAccount>,
    pub signer: Signer<'info>,
}

pub fn open_dispute(ctx: Context<OpenDispute>) -> Result<()> {
    let task = &mut ctx.accounts.task_account;
    require!(task.status == TaskStatus::Submitted, BasiraError::InvalidStatus);
    require!(
        ctx.accounts.signer.key() == task.poster_wallet || ctx.accounts.signer.key() == ARBITRATOR_KEY,
        BasiraError::Unauthorized
    );

    task.status = TaskStatus::Disputed;
    Ok(())
}

#[derive(Accounts)]
pub struct ResolveDispute<'info> {
    #[account(mut)]
    pub task_account: Account<'info, TaskAccount>,
    pub arbitrator: Signer<'info>,
    #[account(mut)]
    pub agent_account: Account<'info, AgentAccount>,
    /// CHECK: Escrow vault
    #[account(mut)]
    pub escrow_vault: SystemAccount<'info>,
    /// CHECK: Poster to refund to
    #[account(mut)]
    pub poster: SystemAccount<'info>,
    /// CHECK: Agent wallet
    #[account(mut)]
    pub agent: SystemAccount<'info>,
    /// CHECK: Treasury
    #[account(mut)]
    pub treasury: SystemAccount<'info>,
}

pub fn resolve_dispute(ctx: Context<ResolveDispute>, ruling_for_agent: bool) -> Result<()> {
    let task = &mut ctx.accounts.task_account;
    require!(task.status == TaskStatus::Disputed, BasiraError::InvalidStatus);
    require!(ctx.accounts.arbitrator.key() == ARBITRATOR_KEY, BasiraError::Unauthorized);
    require!(ctx.accounts.agent_account.wallet == task.assigned_agent.unwrap(), BasiraError::Unauthorized);

    let amount = task.amount;

    if ruling_for_agent {
        task.status = TaskStatus::Settled;
        ctx.accounts.agent_account.completed_count += 1;

        let fee = (amount as u128 * task.fee_bps as u128 / 10000) as u64;
        let payout = amount - fee;

        ctx.accounts.escrow_vault.sub_lamports(amount)?;
        ctx.accounts.agent.add_lamports(payout)?;
        ctx.accounts.treasury.add_lamports(fee)?;
    } else {
        task.status = TaskStatus::Refunded;
        ctx.accounts.agent_account.disputed_count += 1;

        ctx.accounts.escrow_vault.sub_lamports(amount)?;
        ctx.accounts.poster.add_lamports(amount)?;
    }

    Ok(())
}

#[derive(Accounts)]
pub struct ExpireTask<'info> {
    #[account(mut)]
    pub task_account: Account<'info, TaskAccount>,
    #[account(mut)]
    pub agent_account: Option<Account<'info, AgentAccount>>,
    /// CHECK: Escrow vault
    #[account(mut)]
    pub escrow_vault: SystemAccount<'info>,
    /// CHECK: Poster to refund to
    #[account(mut)]
    pub poster: SystemAccount<'info>,
}

pub fn expire_task(ctx: Context<ExpireTask>) -> Result<()> {
    let task = &mut ctx.accounts.task_account;
    require!(task.status == TaskStatus::Created || task.status == TaskStatus::Assigned, BasiraError::InvalidStatus);
    require!(Clock::get()?.unix_timestamp >= task.deadline, BasiraError::DeadlineNotPassed);
    require!(task.poster_wallet == ctx.accounts.poster.key(), BasiraError::Unauthorized);

    task.status = TaskStatus::Expired;

    if let Some(agent_acc) = &mut ctx.accounts.agent_account {
        require!(task.assigned_agent == Some(agent_acc.wallet), BasiraError::Unauthorized);
        agent_acc.disputed_count += 1;
    }

    let amount = task.amount;
    ctx.accounts.escrow_vault.sub_lamports(amount)?;
    ctx.accounts.poster.add_lamports(amount)?;

    Ok(())
}

#[derive(Accounts)]
pub struct CancelTask<'info> {
    #[account(mut, has_one = poster_wallet)]
    pub task_account: Account<'info, TaskAccount>,
    pub poster_wallet: Signer<'info>,
    /// CHECK: Escrow vault
    #[account(mut)]
    pub escrow_vault: SystemAccount<'info>,
    /// CHECK: Poster to refund to
    #[account(mut)]
    pub poster: SystemAccount<'info>,
}

pub fn cancel_task(ctx: Context<CancelTask>) -> Result<()> {
    let task = &mut ctx.accounts.task_account;
    require!(task.status == TaskStatus::Created, BasiraError::CannotCancelAssigned);
    require!(task.assigned_agent.is_none(), BasiraError::CannotCancelAssigned);
    // Refund must go to the same wallet that signed (and that owns the task);
    // without this check the signer could redirect the refund to any account.
    require!(
        ctx.accounts.poster.key() == ctx.accounts.poster_wallet.key(),
        BasiraError::Unauthorized
    );

    task.status = TaskStatus::Refunded;

    let amount = task.amount;
    ctx.accounts.escrow_vault.sub_lamports(amount)?;
    ctx.accounts.poster.add_lamports(amount)?;

    Ok(())
}
