use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;
use state::TaskMode;

declare_id!("9Lc7odoQ3TWXo6yZWnYnGXmAsFNP3Gh6NYgxNhhaxvkj");

#[program]
pub mod basira {
    use super::*;

    pub fn register_agent(ctx: Context<RegisterAgent>, agent_wallet: Pubkey) -> Result<()> {
        register_agent_handler(ctx, agent_wallet)
    }

    pub fn create_task_sol(
        ctx: Context<CreateTaskSol>,
        task_id: [u8; 16],
        mode: TaskMode,
        amount: u64,
        deadline: i64,
        assigned_agent: Option<Pubkey>,
    ) -> Result<()> {
        create_task_sol_handler(ctx, task_id, mode, amount, deadline, assigned_agent)
    }

    pub fn cancel_task_sol(ctx: Context<CancelTaskSol>) -> Result<()> {
        cancel_task_sol_handler(ctx)
    }

    pub fn assign_agent(ctx: Context<AssignAgent>) -> Result<()> {
        assign_agent_handler(ctx)
    }

    pub fn reject_assignment_sol(ctx: Context<RejectAssignmentSol>) -> Result<()> {
        reject_assignment_sol_handler(ctx)
    }

    pub fn submit_deliverable(ctx: Context<SubmitDeliverable>) -> Result<()> {
        submit_deliverable_handler(ctx)
    }

    pub fn approve_sol(ctx: Context<ApproveSol>) -> Result<()> {
        approve_sol_handler(ctx)
    }

    pub fn claim_after_timeout_sol(ctx: Context<ClaimAfterTimeoutSol>) -> Result<()> {
        claim_after_timeout_sol_handler(ctx)
    }

    pub fn open_dispute(ctx: Context<OpenDispute>) -> Result<()> {
        open_dispute_handler(ctx)
    }

    pub fn resolve_dispute_sol(
        ctx: Context<ResolveDisputeSol>,
        ruling: DisputeRuling,
    ) -> Result<()> {
        resolve_dispute_sol_handler(ctx, ruling)
    }

    pub fn expire_task_sol(ctx: Context<ExpireTaskSol>) -> Result<()> {
        expire_task_sol_handler(ctx)
    }

    pub fn create_task_usdc(
        ctx: Context<CreateTaskUsdc>,
        task_id: [u8; 16],
        mode: TaskMode,
        amount: u64,
        deadline: i64,
        assigned_agent: Option<Pubkey>,
    ) -> Result<()> {
        create_task_usdc_handler(ctx, task_id, mode, amount, deadline, assigned_agent)
    }

    pub fn cancel_task_usdc(ctx: Context<CancelTaskUsdc>) -> Result<()> {
        cancel_task_usdc_handler(ctx)
    }

    pub fn reject_assignment_usdc(ctx: Context<RejectAssignmentUsdc>) -> Result<()> {
        reject_assignment_usdc_handler(ctx)
    }

    pub fn approve_usdc(ctx: Context<ApproveUsdc>) -> Result<()> {
        approve_usdc_handler(ctx)
    }

    pub fn claim_after_timeout_usdc(ctx: Context<ClaimAfterTimeoutUsdc>) -> Result<()> {
        claim_after_timeout_usdc_handler(ctx)
    }

    pub fn resolve_dispute_usdc(
        ctx: Context<ResolveDisputeUsdc>,
        ruling: DisputeRuling,
    ) -> Result<()> {
        resolve_dispute_usdc_handler(ctx, ruling)
    }

    pub fn expire_task_usdc(ctx: Context<ExpireTaskUsdc>) -> Result<()> {
        expire_task_usdc_handler(ctx)
    }
}
