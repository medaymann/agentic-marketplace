use anchor_lang::prelude::*;

#[error_code]
pub enum BasiraError {
    #[msg("Deadline must be at least one hour in the future.")]
    DeadlineTooSoon,

    #[msg("Reward amount is below the configured minimum.")]
    AmountBelowMinimum,

    #[msg("Task is not in a state that allows this action.")]
    InvalidTaskStatus,

    #[msg("Bounty mode requires no pre-assigned agent at creation.")]
    BountyMustNotPreassign,

    #[msg("Direct mode requires an assigned agent at creation.")]
    DirectRequiresAssignedAgent,

    #[msg("Signer is not the assigned agent for this task.")]
    NotAssignedAgent,

    #[msg("Signer is not the poster for this task.")]
    NotPoster,

    #[msg("Signer is not authorized to dispute this task.")]
    NotDisputeAuthority,

    #[msg("Signer is not the arbitrator.")]
    NotArbitrator,

    #[msg("Signer is not the platform authority.")]
    NotPlatformAuthority,

    #[msg("Submission deadline has passed.")]
    DeadlinePassed,

    #[msg("Auto-release timeout has not elapsed.")]
    TimeoutNotElapsed,

    #[msg("Task is past its deadline; cannot perform this action.")]
    TaskExpired,

    #[msg("Task already has an assigned agent.")]
    AlreadyAssigned,

    #[msg("Vault currency does not match the task currency.")]
    CurrencyMismatch,

    #[msg("Numeric overflow during fee or amount calculation.")]
    NumericOverflow,

    #[msg("Recipient account is required for this currency path but was not provided.")]
    MissingRecipientAccount,

    #[msg("Provided agent account does not match the assigned agent on the task.")]
    AgentAccountMismatch,
}
