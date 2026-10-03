CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE EXTENSION IF NOT EXISTS citext;

CREATE TYPE user_role AS ENUM('student', 'staff', 'admin');

CREATE TYPE item_type AS ENUM('lost', 'found');

CREATE TYPE item_status AS ENUM(
  'reported',
  'under_review',
  'found',
  'claimed',
  'completed',
  'returned',
  'closed'
);

CREATE TYPE claim_status AS ENUM('pending', 'approved', 'rejected', 'claimed', 'released');

CREATE TABLE users (
  user_id BIGSERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email CITEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  password_reset_token_hash TEXT,
  password_reset_expires_at TIMESTAMPTZ,
  role user_role NOT NULL DEFAULT 'student',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE categories (
  category_id BIGSERIAL PRIMARY KEY,
  category_name VARCHAR(80) UNIQUE NOT NULL,
  description TEXT
);

CREATE TABLE locations (
  location_id BIGSERIAL PRIMARY KEY,
  location_name VARCHAR(120) NOT NULL,
  building VARCHAR(100) NOT NULL,
  floor VARCHAR(30),
  UNIQUE (building, location_name, floor)
);

CREATE TABLE items (
  item_id BIGSERIAL PRIMARY KEY,
  reporter_id BIGINT NOT NULL REFERENCES users (user_id) ON DELETE RESTRICT,
  category_id BIGINT NOT NULL REFERENCES categories (category_id) ON DELETE RESTRICT,
  location_id BIGINT NOT NULL REFERENCES locations (location_id) ON DELETE RESTRICT,
  item_type item_type NOT NULL,
  title VARCHAR(160) NOT NULL,
  description TEXT NOT NULL,
  date_reported DATE NOT NULL,
  status item_status NOT NULL DEFAULT 'reported',
  reporter_name VARCHAR(120),
  contact_phone VARCHAR(40),
  is_anonymous BOOLEAN NOT NULL DEFAULT false,
  hide_phone BOOLEAN NOT NULL DEFAULT true,
  map_x NUMERIC(5, 2),
  map_y NUMERIC(5, 2),
  matched_lost_id BIGINT REFERENCES items (item_id) ON DELETE SET NULL,
  matched_found_id BIGINT REFERENCES items (item_id) ON DELETE SET NULL,
  review_lost_id BIGINT REFERENCES items (item_id) ON DELETE SET NULL,
  finder_name VARCHAR(120),
  found_location TEXT,
  confirmation_date TIMESTAMPTZ,
  matched_by BIGINT REFERENCES users (user_id) ON DELETE SET NULL,
  verifier_notes TEXT,
  collection_date TIMESTAMPTZ,
  collected_by BIGINT REFERENCES users (user_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE item_images (
  image_id BIGSERIAL PRIMARY KEY,
  item_id BIGINT NOT NULL REFERENCES items (item_id) ON DELETE CASCADE,
  image_path TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE item_status_log (
  status_log_id BIGSERIAL PRIMARY KEY,
  item_id BIGINT NOT NULL REFERENCES items (item_id) ON DELETE CASCADE,
  changed_by BIGINT NOT NULL REFERENCES users (user_id) ON DELETE RESTRICT,
  old_status item_status,
  new_status item_status NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE claims (
  claim_id BIGSERIAL PRIMARY KEY,
  item_id BIGINT NOT NULL REFERENCES items (item_id) ON DELETE RESTRICT,
  claimant_id BIGINT NOT NULL REFERENCES users (user_id) ON DELETE RESTRICT,
  claim_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  status claim_status NOT NULL DEFAULT 'pending',
  reviewed_by BIGINT REFERENCES users (user_id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  collection_date TIMESTAMPTZ,
  collected_by BIGINT REFERENCES users (user_id) ON DELETE SET NULL,
  UNIQUE (item_id, claimant_id)
);

CREATE TABLE ownership_proofs (
  proof_id BIGSERIAL PRIMARY KEY,
  claim_id BIGINT NOT NULL REFERENCES claims (claim_id) ON DELETE CASCADE,
  proof_type VARCHAR(60) NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE verifications (
  verification_id BIGSERIAL PRIMARY KEY,
  claim_id BIGINT NOT NULL REFERENCES claims (claim_id) ON DELETE CASCADE,
  staff_id BIGINT NOT NULL REFERENCES users (user_id) ON DELETE RESTRICT,
  result BOOLEAN NOT NULL,
  notes TEXT NOT NULL,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  audit_id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users (user_id) ON DELETE SET NULL,
  action VARCHAR(30) NOT NULL,
  table_name VARCHAR(80) NOT NULL,
  record_id BIGINT NOT NULL,
  old_data JSONB,
  new_data JSONB,
  action_time TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_items_status_date ON items (status, date_reported DESC);

CREATE INDEX idx_items_search ON items USING GIN (
  to_tsvector('english', title || ' ' || description)
);

CREATE INDEX idx_claims_status ON claims (status, claim_date DESC);

CREATE OR REPLACE FUNCTION set_updated_at () RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER items_updated_at
BEFORE UPDATE ON items FOR EACH ROW
EXECUTE FUNCTION set_updated_at ();

CREATE OR REPLACE FUNCTION audit_row_change () RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO audit_logs (action, table_name, record_id, old_data, new_data)
  VALUES (TG_OP, TG_TABLE_NAME, COALESCE(NEW.item_id, OLD.item_id), to_jsonb(OLD), to_jsonb(NEW));
  RETURN COALESCE(NEW, OLD);
END; $$;

CREATE TRIGGER items_audit
AFTER INSERT OR UPDATE OR DELETE ON items FOR EACH ROW
EXECUTE FUNCTION audit_row_change ();

CREATE OR REPLACE FUNCTION log_item_status () RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO item_status_log (item_id, changed_by, old_status, new_status) VALUES (NEW.item_id, NEW.reporter_id, OLD.status, NEW.status);
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER item_status_history
AFTER UPDATE OF status ON items FOR EACH ROW
EXECUTE FUNCTION log_item_status ();

CREATE OR REPLACE PROCEDURE approve_claim (
  p_claim_id BIGINT,
  p_staff_id BIGINT,
  p_notes TEXT
) LANGUAGE plpgsql AS $$
BEGIN
  UPDATE claims SET status = 'approved' WHERE claim_id = p_claim_id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Claim is not pending'; END IF;
  INSERT INTO verifications (claim_id, staff_id, result, notes) VALUES (p_claim_id, p_staff_id, true, p_notes);
  UPDATE items SET status = 'claimed' WHERE item_id = (SELECT item_id FROM claims WHERE claim_id = p_claim_id);
END; $$;

CREATE ROLE app_readonly NOLOGIN;

GRANT USAGE ON SCHEMA public TO app_readonly;

GRANT
SELECT
  ON ALL TABLES IN SCHEMA public TO app_readonly;
