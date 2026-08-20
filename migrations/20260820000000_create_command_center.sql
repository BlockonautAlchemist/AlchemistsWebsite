CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS command_center_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NULL,
  agent text NOT NULL DEFAULT 'spawncamper9000',
  workflow text NOT NULL,
  workflow_label text NOT NULL,
  state text NOT NULL,
  activity text NOT NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  public_url text NULL,
  event_timestamp timestamptz NOT NULL,
  started_at timestamptz NULL,
  ttl_seconds integer NOT NULL DEFAULT 900,
  expires_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT command_center_events_state_check CHECK (
    state IN (
      'idle',
      'researching',
      'browsing',
      'scanning',
      'evaluating',
      'thinking',
      'writing',
      'coding',
      'processing',
      'executing',
      'publishing',
      'posting_to_x',
      'newsletter',
      'terminal_publish',
      'waiting',
      'complete',
      'warning',
      'error'
    )
  ),
  CONSTRAINT command_center_events_ttl_check CHECK (ttl_seconds BETWEEN 30 AND 3600),
  CONSTRAINT command_center_events_context_object_check CHECK (jsonb_typeof(context) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS command_center_events_agent_event_id_unique_idx
  ON command_center_events (agent, event_id)
  WHERE event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS command_center_events_timestamp_idx
  ON command_center_events (event_timestamp DESC, received_at DESC);

CREATE INDEX IF NOT EXISTS command_center_events_agent_workflow_idx
  ON command_center_events (agent, workflow, event_timestamp DESC);

CREATE TABLE IF NOT EXISTS command_center_workflow_state (
  agent text NOT NULL,
  workflow text NOT NULL,
  latest_event_id uuid NULL REFERENCES command_center_events(id) ON DELETE SET NULL,
  event_id text NULL,
  workflow_label text NOT NULL,
  state text NOT NULL,
  activity text NOT NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  public_url text NULL,
  event_timestamp timestamptz NOT NULL,
  started_at timestamptz NULL,
  ttl_seconds integer NOT NULL DEFAULT 900,
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (agent, workflow),
  CONSTRAINT command_center_workflow_state_state_check CHECK (
    state IN (
      'idle',
      'researching',
      'browsing',
      'scanning',
      'evaluating',
      'thinking',
      'writing',
      'coding',
      'processing',
      'executing',
      'publishing',
      'posting_to_x',
      'newsletter',
      'terminal_publish',
      'waiting',
      'complete',
      'warning',
      'error'
    )
  ),
  CONSTRAINT command_center_workflow_state_ttl_check CHECK (ttl_seconds BETWEEN 30 AND 3600),
  CONSTRAINT command_center_workflow_state_context_object_check CHECK (jsonb_typeof(context) = 'object')
);

CREATE INDEX IF NOT EXISTS command_center_workflow_state_updated_idx
  ON command_center_workflow_state (updated_at DESC);

CREATE INDEX IF NOT EXISTS command_center_workflow_state_expires_idx
  ON command_center_workflow_state (expires_at DESC);
