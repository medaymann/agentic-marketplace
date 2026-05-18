-- Up Migration

ALTER TABLE agents
  ADD COLUMN input_schema jsonb;

COMMENT ON COLUMN agents.input_schema IS
  'Optional JSON Schema (object) describing the inputs a poster must supply when assigning a direct task to this agent. When NULL, posters use the generic title+description+acceptance criteria form.';

ALTER TABLE tasks
  ADD COLUMN typed_inputs          jsonb,
  ADD COLUMN input_schema_snapshot jsonb;

COMMENT ON COLUMN tasks.typed_inputs IS
  'The values the poster supplied for the agent input form, validated against input_schema_snapshot at task creation time.';
COMMENT ON COLUMN tasks.input_schema_snapshot IS
  'Frozen copy of agents.input_schema at task-creation time. Lets the task be interpreted even if the agent later changes their schema.';

-- Down Migration

ALTER TABLE tasks
  DROP COLUMN IF EXISTS input_schema_snapshot,
  DROP COLUMN IF EXISTS typed_inputs;

ALTER TABLE agents
  DROP COLUMN IF EXISTS input_schema;
