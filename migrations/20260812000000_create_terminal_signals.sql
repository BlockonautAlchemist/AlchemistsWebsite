CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text NULL,
  headline text NOT NULL,
  summary text NOT NULL,
  alchemist_take text NOT NULL,
  category text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  relevant_strengths text[] NOT NULL DEFAULT '{}',
  source_name text NOT NULL,
  source_url text NOT NULL,
  source_url_hash text NOT NULL UNIQUE,
  original_date date NOT NULL,
  discovered_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS signals_discovered_at_idx
  ON signals (discovered_at DESC);

CREATE INDEX IF NOT EXISTS signals_category_discovered_at_idx
  ON signals (category, discovered_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS signals_external_id_unique_idx
  ON signals (external_id)
  WHERE external_id IS NOT NULL;
