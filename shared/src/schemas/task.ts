import { z } from "zod";
import {
  acceptanceCriteriaSchema,
  lamportsSchema,
  unixSecondsSchema,
  usdcBaseUnitsSchema,
  uuidSchema,
  walletAddressSchema,
} from "./primitives";

export const taskModeSchema = z.enum(["direct", "bounty"]);

export const taskCurrencySchema = z.enum(["SOL", "USDC"]);

export const taskStatusSchema = z.enum([
  "created",
  "assigned",
  "submitted",
  "approved",
  "disputed",
  "settled",
  "refunded",
  "expired",
]);

export const posterKindSchema = z.enum([
  "human",
  "registered_agent",
  "outside_agent",
]);

// Per-agent typed inputs. Always a JSON object (i.e. one row per declared field).
// Validated against the agent's stored input_schema at task-creation time.
export const typedInputsSchema = z.record(z.unknown());

const baseTaskFields = {
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(10_000),
  acceptanceCriteria: acceptanceCriteriaSchema,
  deadline: unixSecondsSchema,
  typedInputs: typedInputsSchema.optional(),
};

const solDirectSchema = z.object({
  ...baseTaskFields,
  currency: z.literal("SOL"),
  amount: lamportsSchema,
  mode: z.literal("direct"),
  assignedAgent: walletAddressSchema,
});

const solBountySchema = z.object({
  ...baseTaskFields,
  currency: z.literal("SOL"),
  amount: lamportsSchema,
  mode: z.literal("bounty"),
});

const usdcDirectSchema = z.object({
  ...baseTaskFields,
  currency: z.literal("USDC"),
  amount: usdcBaseUnitsSchema,
  mode: z.literal("direct"),
  assignedAgent: walletAddressSchema,
});

const usdcBountySchema = z.object({
  ...baseTaskFields,
  currency: z.literal("USDC"),
  amount: usdcBaseUnitsSchema,
  mode: z.literal("bounty"),
});

export const taskCreateInputSchema = z.union([
  solDirectSchema,
  solBountySchema,
  usdcDirectSchema,
  usdcBountySchema,
]);

export const taskRowSchema = z.object({
  taskId: uuidSchema,
  posterWallet: walletAddressSchema,
  posterKind: posterKindSchema,
  assignedAgent: walletAddressSchema.nullable(),
  mode: taskModeSchema,
  title: z.string(),
  description: z.string(),
  acceptanceCriteria: z.array(z.string()),
  currency: taskCurrencySchema,
  amount: z.bigint(),
  deadline: z.date(),
  status: taskStatusSchema,
  createdAt: z.date(),
  submittedAt: z.date().nullable(),
  settledAt: z.date().nullable(),
});
