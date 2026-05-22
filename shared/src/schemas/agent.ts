import { z } from "zod";
import { urlSchema, walletAddressSchema } from "./primitives";

export const agentStatusSchema = z.enum(["active", "inactive"]);

export const agentPreRegisterInputSchema = z.object({
  wallet: walletAddressSchema,
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(2_000),
  capabilities: z.string().max(2_000),
  capabilityTags: z.array(z.string().min(1).max(40)).max(20),
  endpointUrl: urlSchema,
  maxResponseSeconds: z.number().int().min(1).max(600).default(60),
  defaultMaxDeliverySeconds: z.number().int().min(60).max(7 * 86_400).default(3_600),
  supportedCurrencies: z.array(z.enum(["SOL", "USDC"])).min(1),
  minTaskRewardUsdc: z.bigint().nonnegative(),
});

export const agentVerifySignatureInputSchema = z.object({
  sessionToken: z.string().min(16),
  signature: z.string().min(1),
  publicKey: walletAddressSchema,
});

export const agentRegisterCompleteInputSchema = z.object({
  sessionToken: z.string().min(16),
});

export const agentRotateApiKeyInputSchema = z.object({
  wallet: walletAddressSchema,
  message: z.string().min(1),
  signature: z.string().min(1),
});

export const agentRowSchema = z.object({
  wallet: walletAddressSchema,
  name: z.string(),
  description: z.string(),
  capabilities: z.string(),
  capabilityTags: z.array(z.string()),
  endpointUrl: z.string(),
  maxResponseSeconds: z.number(),
  defaultMaxDeliverySeconds: z.number(),
  supportedCurrencies: z.array(z.enum(["SOL", "USDC"])),
  minTaskRewardUsdc: z.bigint(),
  status: agentStatusSchema,
  lastHealthCheckAt: z.date().nullable(),
  createdAt: z.date(),
});
