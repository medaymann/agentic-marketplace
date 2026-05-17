import type { z } from "zod";
import type {
  agentPreRegisterInputSchema,
  agentRegisterCompleteInputSchema,
  agentRotateApiKeyInputSchema,
  agentRowSchema,
  agentStatusSchema,
  agentVerifySignatureInputSchema,
  bountyApplicationInputSchema,
  bountyApplicationRowSchema,
  bountyApplicationStatusSchema,
  commsModeSchema,
  deliverableRowSchema,
  deliverableSubmitInputSchema,
  disputeOpenInputSchema,
  disputeResolveInputSchema,
  disputeResponseInputSchema,
  disputeRowSchema,
  disputeRulingSchema,
  judgeOutputSchema,
  judgeVerdictRowSchema,
  judgeVerdictSchema,
  posterKindSchema,
  presignedUploadRequestSchema,
  presignedUploadSchema,
  settlementCurrencySchema,
  settlementKindSchema,
  settlementRowSchema,
  siwsMessageSchema,
  siwsVerifyInputSchema,
  taskCreateInputSchema,
  taskCurrencySchema,
  taskModeSchema,
  taskRowSchema,
  taskStatusSchema,
  webhookDeliveryRowSchema,
  webhookDeliveryStatusSchema,
  webhookEventSchema,
  webhookPayloadSchema,
} from "../schemas/index";

export type AgentPreRegisterInput = z.infer<typeof agentPreRegisterInputSchema>;
export type AgentVerifySignatureInput = z.infer<typeof agentVerifySignatureInputSchema>;
export type AgentRegisterCompleteInput = z.infer<typeof agentRegisterCompleteInputSchema>;
export type AgentRotateApiKeyInput = z.infer<typeof agentRotateApiKeyInputSchema>;
export type AgentRow = z.infer<typeof agentRowSchema>;
export type AgentStatus = z.infer<typeof agentStatusSchema>;
export type CommsMode = z.infer<typeof commsModeSchema>;

export type BountyApplicationInput = z.infer<typeof bountyApplicationInputSchema>;
export type BountyApplicationRow = z.infer<typeof bountyApplicationRowSchema>;
export type BountyApplicationStatus = z.infer<typeof bountyApplicationStatusSchema>;

export type DeliverableSubmitInput = z.infer<typeof deliverableSubmitInputSchema>;
export type DeliverableRow = z.infer<typeof deliverableRowSchema>;
export type PresignedUploadRequest = z.infer<typeof presignedUploadRequestSchema>;
export type PresignedUpload = z.infer<typeof presignedUploadSchema>;

export type DisputeOpenInput = z.infer<typeof disputeOpenInputSchema>;
export type DisputeResolveInput = z.infer<typeof disputeResolveInputSchema>;
export type DisputeResponseInput = z.infer<typeof disputeResponseInputSchema>;
export type DisputeRow = z.infer<typeof disputeRowSchema>;
export type DisputeRuling = z.infer<typeof disputeRulingSchema>;

export type JudgeOutput = z.infer<typeof judgeOutputSchema>;
export type JudgeVerdict = z.infer<typeof judgeVerdictSchema>;
export type JudgeVerdictRow = z.infer<typeof judgeVerdictRowSchema>;

export type SettlementKind = z.infer<typeof settlementKindSchema>;
export type SettlementCurrency = z.infer<typeof settlementCurrencySchema>;
export type SettlementRow = z.infer<typeof settlementRowSchema>;

export type SiwsMessage = z.infer<typeof siwsMessageSchema>;
export type SiwsVerifyInput = z.infer<typeof siwsVerifyInputSchema>;

export type TaskCreateInput = z.infer<typeof taskCreateInputSchema>;
export type TaskCurrency = z.infer<typeof taskCurrencySchema>;
export type TaskMode = z.infer<typeof taskModeSchema>;
export type TaskRow = z.infer<typeof taskRowSchema>;
export type TaskStatus = z.infer<typeof taskStatusSchema>;
export type PosterKind = z.infer<typeof posterKindSchema>;

export type WebhookDeliveryRow = z.infer<typeof webhookDeliveryRowSchema>;
export type WebhookDeliveryStatus = z.infer<typeof webhookDeliveryStatusSchema>;
export type WebhookEvent = z.infer<typeof webhookEventSchema>;
export type WebhookPayload = z.infer<typeof webhookPayloadSchema>;

export {
  compileSchema,
  validateAgainstSchema,
  isFormShapedSchema,
  SchemaCompileError,
  TypedInputsValidationError,
} from "./typed-inputs";
