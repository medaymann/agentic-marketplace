import { z } from "zod";
import { uuidSchema, walletAddressSchema } from "./primitives";

export const webhookEventSchema = z.enum([
  "task.created",
  "task.offered",
  "task.assigned",
  "task.submitted",
  "task.approved",
  "task.disputed",
  "task.settled",
  "task.refunded",
  "task.expired",
  "task.cancelled",
  "dispute.opened",
  "dispute.resolved",
  "payment.released",
]);

export const webhookDeliveryStatusSchema = z.enum([
  "pending",
  "delivered",
  "failed",
]);

export const webhookPayloadSchema = z.object({
  version: z.literal("1.0"),
  event: webhookEventSchema,
  deliveryId: uuidSchema,
  timestamp: z.number().int().positive(),
  data: z.record(z.unknown()),
});

export const webhookDeliveryRowSchema = z.object({
  id: uuidSchema,
  agentWallet: walletAddressSchema,
  event: webhookEventSchema,
  payload: z.record(z.unknown()),
  status: webhookDeliveryStatusSchema,
  attempts: z.number().int().nonnegative(),
  lastError: z.string().nullable(),
  nextRetryAt: z.date().nullable(),
  createdAt: z.date(),
  deliveredAt: z.date().nullable(),
});
