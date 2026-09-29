-- ============================================================================
-- NeuroNest AI  --  Supabase / PostgreSQL schema
-- ============================================================================
-- This file is a 1:1 mirror of the SQLAlchemy models in
-- backend/app/models/models.py. It was generated from those models with the
-- PostgreSQL dialect, so `Base.metadata.create_all()` (what the bootstrap
-- script and `uvicorn` startup use) produces exactly the same tables.
-- tests/test_supabase_config.py asserts the two can never drift apart.
--
-- TWO WAYS TO CREATE THE SCHEMA - pick one:
--
--   A) Let the app do it (recommended, nothing to paste):
--        cd F:\Neuronest-AI\backend
--        ..\venv\Scripts\python.exe scripts\supabase_setup.py --create
--
--   B) Paste this file into Supabase:
--        Dashboard -> SQL Editor -> New query -> paste -> Run
--
-- Everything is `IF NOT EXISTS`, so running it twice is harmless: it never
-- drops a table and never overwrites data.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- ENUM: the `role` column is a native Postgres enum, matching SQLAlchemy's
-- Enum(UserRole), whose default type name is the lower-cased class name.
-- Wrapped in a guard because CREATE TYPE has no IF NOT EXISTS.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'userrole') THEN
        CREATE TYPE userrole AS ENUM ('patient', 'caregiver');
    END IF;
END
$$;


-- ----------------------------------------------------------------------------
-- users  --  one row per patient or caregiver account
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
	id SERIAL NOT NULL,
	name VARCHAR NOT NULL,
	email VARCHAR NOT NULL,
	password_hash VARCHAR,
	role userrole NOT NULL,
	language VARCHAR,
	created_at TIMESTAMP WITHOUT TIME ZONE,
	google_sub VARCHAR,
	auth_provider VARCHAR NOT NULL,
	avatar_url VARCHAR,
	PRIMARY KEY (id)
);
CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email ON users (email);
CREATE UNIQUE INDEX IF NOT EXISTS ix_users_google_sub ON users (google_sub);
CREATE INDEX IF NOT EXISTS ix_users_id ON users (id);


-- ----------------------------------------------------------------------------
-- caregiver_patient  --  which caregiver may see which patient
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS caregiver_patient (
	id SERIAL NOT NULL,
	caregiver_id INTEGER NOT NULL,
	patient_id INTEGER NOT NULL,
	created_at TIMESTAMP WITHOUT TIME ZONE,
	PRIMARY KEY (id),
	FOREIGN KEY(caregiver_id) REFERENCES users (id),
	FOREIGN KEY(patient_id) REFERENCES users (id)
);
CREATE INDEX IF NOT EXISTS ix_caregiver_patient_caregiver_id ON caregiver_patient (caregiver_id);
CREATE INDEX IF NOT EXISTS ix_caregiver_patient_id ON caregiver_patient (id);
CREATE INDEX IF NOT EXISTS ix_caregiver_patient_patient_id ON caregiver_patient (patient_id);


-- ----------------------------------------------------------------------------
-- game_sessions  --  one row per finished game. `client_id` is the
-- device-generated id that makes offline sync idempotent.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS game_sessions (
	id SERIAL NOT NULL,
	client_id VARCHAR,
	patient_id INTEGER NOT NULL,
	game_type VARCHAR NOT NULL,
	difficulty INTEGER,
	score FLOAT,
	accuracy FLOAT,
	response_time FLOAT,
	mistakes INTEGER,
	attempts INTEGER,
	completed BOOLEAN,
	offline_created BOOLEAN,
	created_at TIMESTAMP WITHOUT TIME ZONE,
	synced_at TIMESTAMP WITHOUT TIME ZONE,
	PRIMARY KEY (id),
	FOREIGN KEY(patient_id) REFERENCES users (id)
);
CREATE INDEX IF NOT EXISTS ix_game_sessions_client_id ON game_sessions (client_id);
CREATE INDEX IF NOT EXISTS ix_game_sessions_created_at ON game_sessions (created_at);
CREATE INDEX IF NOT EXISTS ix_game_sessions_id ON game_sessions (id);
CREATE INDEX IF NOT EXISTS ix_game_sessions_patient_id ON game_sessions (patient_id);


-- ----------------------------------------------------------------------------
-- recommendations  --  "what to play next" suggestions for a patient
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recommendations (
	id SERIAL NOT NULL,
	patient_id INTEGER NOT NULL,
	game_type VARCHAR NOT NULL,
	difficulty INTEGER NOT NULL,
	reason VARCHAR NOT NULL,
	confidence FLOAT,
	created_at TIMESTAMP WITHOUT TIME ZONE,
	PRIMARY KEY (id),
	FOREIGN KEY(patient_id) REFERENCES users (id)
);
CREATE INDEX IF NOT EXISTS ix_recommendations_id ON recommendations (id);
CREATE INDEX IF NOT EXISTS ix_recommendations_patient_id ON recommendations (patient_id);


-- ----------------------------------------------------------------------------
-- reminders  --  caregiver-set nudges for a patient
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reminders (
	id SERIAL NOT NULL,
	patient_id INTEGER NOT NULL,
	caregiver_id INTEGER NOT NULL,
	title VARCHAR NOT NULL,
	description VARCHAR,
	scheduled_time TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	completed BOOLEAN,
	created_at TIMESTAMP WITHOUT TIME ZONE,
	PRIMARY KEY (id),
	FOREIGN KEY(patient_id) REFERENCES users (id),
	FOREIGN KEY(caregiver_id) REFERENCES users (id)
);
CREATE INDEX IF NOT EXISTS ix_reminders_caregiver_id ON reminders (caregiver_id);
CREATE INDEX IF NOT EXISTS ix_reminders_id ON reminders (id);
CREATE INDEX IF NOT EXISTS ix_reminders_patient_id ON reminders (patient_id);


-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
-- Read this before deleting it.
--
-- Supabase exposes every table over its public REST API at
--     https://<project-ref>.supabase.co/rest/v1/users
-- and the `anon` key that authorises those calls ships inside your frontend
-- bundle, so it is public by definition. Without RLS, ANYONE holding that key
-- can read every patient's name, email and cognitive scores.
--
-- The NeuroNest API is unaffected by this block: it connects as the `postgres`
-- role using the database password, and a table's owner bypasses RLS. So
-- enabling RLS with no policies:
--
--   * leaves the API completely free to read and write, and
--   * locks the public REST endpoint out of personal health data.
--
-- If you later want the anon-key client (app/database/supabase_client.py) to
-- reach a table, add a NARROW policy for that one table instead of disabling
-- RLS here.
-- ============================================================================
ALTER TABLE users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE caregiver_patient ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders         ENABLE ROW LEVEL SECURITY;
