-- ==============================================================================
-- Migration 005: Comprehensive PostgreSQL Audit Trail, Activity History & Campus Branding
-- ==============================================================================

-- 1. Ensure pgcrypto extension is available
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Add username and is_active columns to users if not present, and populate historical usernames
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(60);

-- Backfill usernames for known and existing accounts
UPDATE users SET username = 'allen' WHERE user_id = 1 AND (username IS NULL OR username = '');
UPDATE users SET username = LOWER(SPLIT_PART(email::text, '@', 1)) WHERE username IS NULL OR username = '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_username_unique'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_username_unique UNIQUE (username);
  END IF;
END $$;

-- 3. Extend / Harmonize audit_logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY
);

-- Rename legacy audit_id to id if still named audit_id
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'audit_logs' AND column_name = 'audit_id'
  ) THEN
    ALTER TABLE audit_logs RENAME COLUMN audit_id TO id;
  END IF;
END $$;

-- Add all required standard audit columns
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_user_id BIGINT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_username VARCHAR(120);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_role VARCHAR(50);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'SUCCESS';
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS entity_type VARCHAR(80);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS entity_id VARCHAR(80);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS old_values JSONB;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS new_values JSONB;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS changed_fields JSONB;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS ip_address VARCHAR(80);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Ensure legacy columns exist for backwards compatibility with any older queries
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_id BIGINT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS table_name VARCHAR(80);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS record_id BIGINT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS old_data JSONB;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS new_data JSONB;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS action_time TIMESTAMPTZ DEFAULT now();

-- Backfill new columns from existing legacy columns
UPDATE audit_logs
SET actor_user_id = COALESCE(actor_user_id, user_id),
    entity_type = COALESCE(entity_type, table_name),
    entity_id = COALESCE(entity_id, record_id::text),
    old_values = COALESCE(old_values, old_data),
    new_values = COALESCE(new_values, new_data),
    created_at = COALESCE(created_at, action_time),
    status = COALESCE(status, 'SUCCESS'),
    description = COALESCE(description, action || ' on ' || table_name)
WHERE actor_user_id IS NULL AND user_id IS NOT NULL;

-- Backfill historical actor username and role from users table
UPDATE audit_logs a
SET actor_username = COALESCE(a.actor_username, u.username, u.name, SPLIT_PART(u.email::text, '@', 1), 'system'),
    actor_role = COALESCE(a.actor_role, u.role::text, 'system')
FROM users u
WHERE (a.actor_user_id = u.user_id OR a.user_id = u.user_id)
  AND (a.actor_username IS NULL OR a.actor_role IS NULL);

-- Default any remaining null actor info to system
UPDATE audit_logs
SET actor_username = COALESCE(actor_username, 'system'),
    actor_role = COALESCE(actor_role, 'system'),
    entity_type = COALESCE(entity_type, table_name, 'unknown'),
    entity_id = COALESCE(entity_id, record_id::text, '0'),
    description = COALESCE(description, action || ' recorded by database')
WHERE actor_username IS NULL OR actor_role IS NULL;

-- 4. Create Indexes on audit_logs for high-performance querying and filtering
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_user_id ON audit_logs (actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_username ON audit_logs (LOWER(actor_username));
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_role ON audit_logs (actor_role);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_status ON audit_logs (status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs (entity_type, entity_id);

-- 5. Create Campus Logo table for system branding & logo management
CREATE TABLE IF NOT EXISTS campus_logo (
  logo_id BIGSERIAL PRIMARY KEY,
  logo_name VARCHAR(120) NOT NULL DEFAULT 'Official Campus Logo',
  image_path TEXT NOT NULL,
  file_size BIGINT,
  mime_type VARCHAR(60),
  updated_by BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed initial default logo record if table is empty
INSERT INTO campus_logo (logo_id, logo_name, image_path, created_at, updated_at)
VALUES (1, 'Campus Main Logo', '/assets/img/campus-logo.svg', now(), now())
ON CONFLICT (logo_id) DO NOTHING;

-- 6. Comprehensive Overview Views for Activity Dashboard & Reports

-- Master Lifetime & Metric Overview
CREATE OR REPLACE VIEW v_audit_activity_overview AS
SELECT
  COUNT(*)::bigint AS total_actions,
  COUNT(*) FILTER (WHERE status = 'SUCCESS')::bigint AS total_success,
  COUNT(*) FILTER (WHERE status = 'FAILURE')::bigint AS total_failure,
  COUNT(*) FILTER (WHERE action IN ('CREATE', 'INSERT'))::bigint AS total_creates,
  COUNT(*) FILTER (WHERE action IN ('UPDATE', 'UPDATE_PROFILE', 'UPDATE_PREFERENCES', 'APPROVE', 'REJECT', 'MATCH', 'COLLECT', 'ACTIVATE', 'ARCHIVE'))::bigint AS total_updates,
  COUNT(*) FILTER (WHERE action IN ('DELETE', 'REMOVE'))::bigint AS total_deletes,
  MAX(created_at) AS last_activity_at
FROM audit_logs;

-- Activity Grouped by Username & Role
CREATE OR REPLACE VIEW v_audit_user_summary AS
SELECT
  actor_username,
  actor_role,
  COUNT(*) FILTER (WHERE action IN ('CREATE', 'INSERT'))::bigint AS creates,
  COUNT(*) FILTER (WHERE action IN ('UPDATE', 'UPDATE_PROFILE', 'UPDATE_PREFERENCES', 'APPROVE', 'REJECT', 'MATCH', 'COLLECT', 'ACTIVATE', 'ARCHIVE'))::bigint AS updates,
  COUNT(*) FILTER (WHERE action IN ('DELETE', 'REMOVE'))::bigint AS deletes,
  COUNT(*)::bigint AS total,
  MAX(created_at) AS last_action_at
FROM audit_logs
GROUP BY actor_username, actor_role
ORDER BY total DESC;

-- Activity Grouped by Role
CREATE OR REPLACE VIEW v_audit_role_summary AS
SELECT
  actor_role,
  COUNT(*)::bigint AS count,
  COUNT(*) FILTER (WHERE status = 'SUCCESS')::bigint AS success_count,
  COUNT(*) FILTER (WHERE status = 'FAILURE')::bigint AS failure_count
FROM audit_logs
GROUP BY actor_role
ORDER BY count DESC;

-- Activity Grouped by Resource / Entity Type
CREATE OR REPLACE VIEW v_audit_entity_summary AS
SELECT
  entity_type,
  COUNT(*)::bigint AS count,
  MAX(created_at) AS last_activity_at
FROM audit_logs
GROUP BY entity_type
ORDER BY count DESC;

-- Activity Grouped by Date
CREATE OR REPLACE VIEW v_audit_daily_activity AS
SELECT
  (created_at AT TIME ZONE 'UTC')::date AS activity_date,
  COUNT(*)::bigint AS count,
  COUNT(*) FILTER (WHERE status = 'SUCCESS')::bigint AS success_count,
  COUNT(*) FILTER (WHERE status = 'FAILURE')::bigint AS failure_count
FROM audit_logs
GROUP BY (created_at AT TIME ZONE 'UTC')::date
ORDER BY activity_date DESC;

-- 7. Intelligent PostgreSQL-Level Trigger Function & Protections

CREATE OR REPLACE FUNCTION audit_row_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_skip text;
  v_actor_id text;
  v_actor_username text;
  v_actor_role text;
  v_ip text;
  v_user_agent text;
  v_entity_id text;
  v_old_json jsonb := null;
  v_new_json jsonb := null;
  v_changed_fields jsonb := null;
  v_key text;
  v_desc text;
  v_action text;
BEGIN
  -- 1. Check if application has explicitly logged this action within the same transaction
  v_skip := current_setting('audit.skip_trigger', true);
  IF v_skip = 'true' OR v_skip = 'on' OR v_skip = '1' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- 2. Read transaction-local application actor session variables if available
  v_actor_id := current_setting('audit.actor_user_id', true);
  v_actor_username := current_setting('audit.actor_username', true);
  v_actor_role := current_setting('audit.actor_role', true);
  v_ip := current_setting('audit.client_ip', true);
  v_user_agent := current_setting('audit.user_agent', true);

  -- 3. Prepare snapshots and entity_id by operation type
  IF TG_OP = 'DELETE' THEN
    v_action := 'DELETE';
    v_old_json := to_jsonb(OLD);
    -- Strip security-sensitive fields from snapshots
    v_old_json := v_old_json - 'password_hash' - 'password_reset_token_hash';

    IF TG_TABLE_NAME = 'items' THEN v_entity_id := OLD.item_id::text;
    ELSIF TG_TABLE_NAME = 'claims' THEN v_entity_id := OLD.claim_id::text;
    ELSIF TG_TABLE_NAME = 'users' THEN v_entity_id := OLD.user_id::text;
    ELSIF TG_TABLE_NAME = 'campus_maps' THEN v_entity_id := OLD.map_id::text;
    ELSIF TG_TABLE_NAME = 'buildings' THEN v_entity_id := OLD.building_id::text;
    ELSIF TG_TABLE_NAME = 'floors' THEN v_entity_id := OLD.floor_id::text;
    ELSIF TG_TABLE_NAME = 'rooms' THEN v_entity_id := OLD.room_id::text;
    ELSIF TG_TABLE_NAME = 'campus_logo' THEN v_entity_id := OLD.logo_id::text;
    ELSE v_entity_id := COALESCE(v_old_json->>'id', '0');
    END IF;

    v_desc := COALESCE(v_actor_username, 'Database trigger') || ' deleted record #' || v_entity_id || ' in ' || TG_TABLE_NAME;

  ELSIF TG_OP = 'INSERT' THEN
    v_action := 'CREATE';
    v_new_json := to_jsonb(NEW);
    v_new_json := v_new_json - 'password_hash' - 'password_reset_token_hash';

    IF TG_TABLE_NAME = 'items' THEN v_entity_id := NEW.item_id::text;
    ELSIF TG_TABLE_NAME = 'claims' THEN v_entity_id := NEW.claim_id::text;
    ELSIF TG_TABLE_NAME = 'users' THEN v_entity_id := NEW.user_id::text;
    ELSIF TG_TABLE_NAME = 'campus_maps' THEN v_entity_id := NEW.map_id::text;
    ELSIF TG_TABLE_NAME = 'buildings' THEN v_entity_id := NEW.building_id::text;
    ELSIF TG_TABLE_NAME = 'floors' THEN v_entity_id := NEW.floor_id::text;
    ELSIF TG_TABLE_NAME = 'rooms' THEN v_entity_id := NEW.room_id::text;
    ELSIF TG_TABLE_NAME = 'campus_logo' THEN v_entity_id := NEW.logo_id::text;
    ELSE v_entity_id := COALESCE(v_new_json->>'id', '0');
    END IF;

    v_desc := COALESCE(v_actor_username, 'Database trigger') || ' created record #' || v_entity_id || ' in ' || TG_TABLE_NAME;

  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'UPDATE';
    v_old_json := to_jsonb(OLD) - 'password_hash' - 'password_reset_token_hash';
    v_new_json := to_jsonb(NEW) - 'password_hash' - 'password_reset_token_hash';

    IF TG_TABLE_NAME = 'items' THEN v_entity_id := NEW.item_id::text;
    ELSIF TG_TABLE_NAME = 'claims' THEN v_entity_id := NEW.claim_id::text;
    ELSIF TG_TABLE_NAME = 'users' THEN v_entity_id := NEW.user_id::text;
    ELSIF TG_TABLE_NAME = 'campus_maps' THEN v_entity_id := NEW.map_id::text;
    ELSIF TG_TABLE_NAME = 'buildings' THEN v_entity_id := NEW.building_id::text;
    ELSIF TG_TABLE_NAME = 'floors' THEN v_entity_id := NEW.floor_id::text;
    ELSIF TG_TABLE_NAME = 'rooms' THEN v_entity_id := NEW.room_id::text;
    ELSIF TG_TABLE_NAME = 'campus_logo' THEN v_entity_id := NEW.logo_id::text;
    ELSE v_entity_id := COALESCE(v_new_json->>'id', '0');
    END IF;

    -- Compute changed fields
    SELECT jsonb_object_agg(key, jsonb_build_object('old', v_old_json->key, 'new', v_new_json->key))
    INTO v_changed_fields
    FROM jsonb_each(v_new_json)
    WHERE v_new_json->key IS DISTINCT FROM v_old_json->key;

    v_desc := COALESCE(v_actor_username, 'Database trigger') || ' updated record #' || v_entity_id || ' in ' || TG_TABLE_NAME;
  END IF;

  -- 4. Insert into centralized audit_logs table
  INSERT INTO audit_logs (
    actor_user_id,
    actor_username,
    actor_role,
    action,
    status,
    entity_type,
    entity_id,
    description,
    old_values,
    new_values,
    changed_fields,
    ip_address,
    user_agent,
    created_at,
    -- legacy column synchronization
    user_id,
    table_name,
    record_id,
    old_data,
    new_data,
    action_time
  ) VALUES (
    NULLIF(v_actor_id, '')::bigint,
    COALESCE(NULLIF(v_actor_username, ''), 'system'),
    COALESCE(NULLIF(v_actor_role, ''), 'system'),
    v_action,
    'SUCCESS',
    TG_TABLE_NAME,
    COALESCE(v_entity_id, '0'),
    v_desc,
    v_old_json,
    v_new_json,
    v_changed_fields,
    v_ip,
    COALESCE(v_user_agent, 'PostgreSQL Database Trigger'),
    now(),
    -- legacy
    NULLIF(v_actor_id, '')::bigint,
    TG_TABLE_NAME,
    COALESCE(NULLIF(v_entity_id, '')::bigint, 0),
    v_old_json,
    v_new_json,
    now()
  );

  RETURN COALESCE(NEW, OLD);
END; $$;

-- 8. Apply Triggers to Key Protected Operational Tables

DROP TRIGGER IF EXISTS items_audit ON items;
CREATE TRIGGER items_audit
AFTER INSERT OR UPDATE OR DELETE ON items FOR EACH ROW
EXECUTE FUNCTION audit_row_change();

DROP TRIGGER IF EXISTS claims_audit ON claims;
CREATE TRIGGER claims_audit
AFTER INSERT OR UPDATE OR DELETE ON claims FOR EACH ROW
EXECUTE FUNCTION audit_row_change();

DROP TRIGGER IF EXISTS users_audit ON users;
CREATE TRIGGER users_audit
AFTER INSERT OR UPDATE OR DELETE ON users FOR EACH ROW
EXECUTE FUNCTION audit_row_change();

DROP TRIGGER IF EXISTS campus_maps_audit ON campus_maps;
CREATE TRIGGER campus_maps_audit
AFTER INSERT OR UPDATE OR DELETE ON campus_maps FOR EACH ROW
EXECUTE FUNCTION audit_row_change();

DROP TRIGGER IF EXISTS campus_logo_audit ON campus_logo;
CREATE TRIGGER campus_logo_audit
AFTER INSERT OR UPDATE OR DELETE ON campus_logo FOR EACH ROW
EXECUTE FUNCTION audit_row_change();

DROP TRIGGER IF EXISTS buildings_audit ON buildings;
CREATE TRIGGER buildings_audit
AFTER INSERT OR UPDATE OR DELETE ON buildings FOR EACH ROW
EXECUTE FUNCTION audit_row_change();

DROP TRIGGER IF EXISTS floors_audit ON floors;
CREATE TRIGGER floors_audit
AFTER INSERT OR UPDATE OR DELETE ON floors FOR EACH ROW
EXECUTE FUNCTION audit_row_change();

DROP TRIGGER IF EXISTS rooms_audit ON rooms;
CREATE TRIGGER rooms_audit
AFTER INSERT OR UPDATE OR DELETE ON rooms FOR EACH ROW
EXECUTE FUNCTION audit_row_change();
