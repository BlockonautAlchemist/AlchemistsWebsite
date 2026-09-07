-- Complete the diagnostic classification for repository-generated production
-- verification runs created before visibility metadata existed. Event rows stay
-- intact; only their visibility and the derived latest-state table change.

UPDATE command_center_events
SET visibility = 'diagnostic'
WHERE visibility = 'public'
  AND (
    event_id LIKE 'replay-%'
    OR event_id LIKE 'real-baseline-%'
    OR event_id LIKE 'real-cleanup-%'
    OR event_id LIKE 'real-replay-%'
    OR event_id LIKE 'real-supplement-%'
    OR event_id LIKE 'verify-%'
    OR event_id LIKE 'supplement-%'
    OR event_id LIKE 'codex-env-check-%'
    OR workflow = 'fixture'
  );

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
