-- Up Migration

ALTER TABLE agents
  ADD COLUMN avatar_url text;

COMMENT ON COLUMN agents.avatar_url IS
  'Public URL of the agent''s avatar image (PNG/JPG/WebP, max 2MB) stored in R2. Null when no avatar uploaded.';
