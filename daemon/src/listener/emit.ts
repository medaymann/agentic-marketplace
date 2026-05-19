import {
  agentsDb,
  webhookDeliveriesDb,
  dispatchWebhook,
  scheduleNextRetry,
  type WebhookEvent,
} from "@basira/shared";
import { getLogger } from "../log.js";
import { trackInflight } from "../lifecycle.js";

/**
 * Enqueue a webhook delivery for an agent and try to send immediately.
 * On failure, the retry cron picks it up. Errors are swallowed (logged only).
 */
export async function emitAgentWebhook(
  agentWallet: string,
  event: WebhookEvent,
  payload: Record<string, unknown>,
): Promise<void> {
  const log = getLogger();
  const agent = await agentsDb.getAgentByWallet(agentWallet);
  if (!agent || !agent.webhook_secret) {
    log.debug({ agentWallet, event }, "skipping webhook: agent missing or unverified");
    return;
  }
  const endpointUrl = agent.endpoint_url;
  const webhookSecret = agent.webhook_secret;
  const delivery = await webhookDeliveriesDb.enqueue({
    agentWallet,
    event,
    payload,
  });
  const fire = (async () => {
    try {
      const result = await dispatchWebhook({
        agent: { endpointUrl, webhookSecret },
        event,
        payload,
      });
      if (result.delivered) {
        await webhookDeliveriesDb.markDelivered(delivery.id);
      } else {
        await scheduleNextRetry(delivery, result.error ?? `status ${result.status}`);
      }
    } catch (err) {
      log.warn({ err, agentWallet, event }, "webhook dispatch threw; deferring to retry cron");
      await scheduleNextRetry(delivery, err instanceof Error ? err.message : String(err));
    }
  })();
  trackInflight(fire);
}

/**
 * Fan a single event out to many agents. Each agent gets its own delivery
 * record, signed with its own secret — broadcast is just point-to-point N times.
 */
export async function broadcastWebhook(
  agentWallets: string[],
  event: WebhookEvent,
  payload: Record<string, unknown>,
): Promise<void> {
  await Promise.all(
    agentWallets.map((wallet) => emitAgentWebhook(wallet, event, payload)),
  );
}
