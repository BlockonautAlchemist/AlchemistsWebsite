-- Backward-compatible public run history and diagnostic classification.
-- Event rows remain immutable in substance: this migration only classifies known
-- repository-generated verification data and rebuilds the derived latest table.

ALTER TABLE command_center_events
  ADD COLUMN IF NOT EXISTS run_id text NULL,
  ADD COLUMN IF NOT EXISTS task_title text NULL,
  ADD COLUMN IF NOT EXISTS outcome text NULL,
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public';

ALTER TABLE command_center_workflow_state
  ADD COLUMN IF NOT EXISTS run_id text NULL,
  ADD COLUMN IF NOT EXISTS task_title text NULL,
  ADD COLUMN IF NOT EXISTS outcome text NULL,
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public';

DO $$ BEGIN
  ALTER TABLE command_center_events
    ADD CONSTRAINT command_center_events_visibility_check
    CHECK (visibility IN ('public', 'diagnostic'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE command_center_workflow_state
    ADD CONSTRAINT command_center_workflow_state_visibility_check
    CHECK (visibility IN ('public', 'diagnostic'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS command_center_events_public_history_idx
  ON command_center_events (agent, event_timestamp DESC, COALESCE(event_id, id::text) COLLATE "C" DESC)
  WHERE visibility = 'public';

CREATE INDEX IF NOT EXISTS command_center_events_public_run_idx
  ON command_center_events (agent, run_id, event_timestamp ASC, COALESCE(event_id, id::text) COLLATE "C" ASC)
  WHERE visibility = 'public' AND run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS command_center_events_public_started_run_idx
  ON command_center_events (agent, workflow, started_at, event_timestamp ASC)
  WHERE visibility = 'public' AND run_id IS NULL AND started_at IS NOT NULL;

-- Only known repository-generated namespaces and the exact synthetic browser
-- workflow are classified. Activity text is intentionally never inspected.
UPDATE command_center_events
SET visibility = 'diagnostic'
WHERE visibility = 'public'
  AND (
    event_id LIKE 'replay-%'
    OR event_id LIKE 'real-cleanup-%'
    OR workflow = 'fixture'
  );

-- Latest workflow state is derived data. Rebuild it exclusively from public
-- events without deleting or rewriting any event row.
DELETE FROM command_center_workflow_state;

INSERT INTO command_center_workflow_state (
  agent, workflow, latest_event_id, event_id, run_id, workflow_label, task_title,
  state, activity, outcome, context, public_url, visibility, event_timestamp,
  started_at, ttl_seconds, expires_at, updated_at
)
SELECT DISTINCT ON (agent, workflow)
  agent, workflow, id, event_id, run_id, workflow_label, task_title,
  state, activity, outcome, context, public_url, visibility, event_timestamp,
  started_at, ttl_seconds, expires_at, now()
FROM command_center_events
WHERE visibility = 'public'
ORDER BY agent, workflow, event_timestamp DESC,
  COALESCE(event_id, id::text) COLLATE "C" DESC;
