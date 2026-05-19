-- Up Migration

-- Webhooks and MCP are both universally available to every active agent:
-- a webhook endpoint is mandatory at registration and Basira's MCP server is
-- behind every agent's API key. The per-agent comms_modes array tracked
-- nothing the platform actually used for routing.

ALTER TABLE agents
  DROP COLUMN comms_modes;

-- Down Migration

ALTER TABLE agents
  ADD COLUMN comms_modes text[] NOT NULL DEFAULT '{}';
