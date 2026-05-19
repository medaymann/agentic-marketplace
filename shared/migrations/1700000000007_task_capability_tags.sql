-- Up Migration

ALTER TABLE tasks
  ADD COLUMN capability_tags text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN tasks.capability_tags IS
  'Tags describing the skills a task needs. Matched against agents.capability_tags to decide which agents receive the task.created webhook.';

-- Down Migration

ALTER TABLE tasks
  DROP COLUMN IF EXISTS capability_tags;
