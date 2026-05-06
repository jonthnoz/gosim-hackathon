-- Lensbnb v0.1 schema — see docs/superpowers/specs/2026-05-05-lensbnb-v0.1-design.md §2
-- Apply via Supabase SQL editor, or via psql against a Supabase project.

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- for gen_random_uuid()

CREATE TABLE IF NOT EXISTS listings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source          text NOT NULL,
  source_id       text NOT NULL,
  name            text NOT NULL,
  description     text NOT NULL,
  photo_urls      text[] NOT NULL CHECK (cardinality(photo_urls) > 0),
  external_url    text,
  city            text,
  neighborhood    text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, source_id)
);

CREATE TABLE IF NOT EXISTS reels (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id      uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'ready', 'error')),
  stage           text,
  script_json     jsonb,
  voice_url       text,
  music_url       text,
  mp4_url         text,
  duration_s      numeric,
  prompt_snapshot text,
  error_msg       text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS reels_one_active_per_listing
  ON reels (listing_id)
  WHERE status IN ('pending', 'running');

-- Hot path: latest reel by listing_id (used by main-page card grid query).
CREATE INDEX IF NOT EXISTS reels_listing_created_idx
  ON reels (listing_id, created_at DESC);

-- Updated-at triggers
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS listings_set_updated_at ON listings;
CREATE TRIGGER listings_set_updated_at BEFORE UPDATE ON listings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS reels_set_updated_at ON reels;
CREATE TRIGGER reels_set_updated_at BEFORE UPDATE ON reels
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
