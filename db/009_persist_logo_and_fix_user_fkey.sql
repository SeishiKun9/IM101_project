-- ============================================================================
-- Migration 009: Persist Campus Logo in Database, Fix User Foreign Key Restrict,
-- and Add User Online/Offline Activity Tracking
-- ============================================================================

-- 1. Ensure campus_logo can store persistent Data URL / base64 image data
ALTER TABLE campus_logo
  ADD COLUMN IF NOT EXISTS image_data TEXT;

-- 2. Add last_active_at to users table for real-time online/offline presence tracking
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_users_last_active_at
  ON users (last_active_at DESC);

-- 3. Fix items foreign key to allow deleting users without RESTRICT violation
--    (Reported items are preserved with original reporter_name, reporter_id becomes NULL)
ALTER TABLE items
  ALTER COLUMN reporter_id DROP NOT NULL;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'items_reporter_id_fkey') THEN
    ALTER TABLE items DROP CONSTRAINT items_reporter_id_fkey;
  END IF;
END $$;

ALTER TABLE items
  ADD CONSTRAINT items_reporter_id_fkey
  FOREIGN KEY (reporter_id) REFERENCES users(user_id) ON DELETE SET NULL;

-- 4. Fix item_status_log foreign key constraint
ALTER TABLE item_status_log
  ALTER COLUMN changed_by DROP NOT NULL;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'item_status_log_changed_by_fkey') THEN
    ALTER TABLE item_status_log DROP CONSTRAINT item_status_log_changed_by_fkey;
  END IF;
END $$;

ALTER TABLE item_status_log
  ADD CONSTRAINT item_status_log_changed_by_fkey
  FOREIGN KEY (changed_by) REFERENCES users(user_id) ON DELETE SET NULL;

-- 5. Fix verifications foreign key constraint
ALTER TABLE verifications
  ALTER COLUMN staff_id DROP NOT NULL;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'verifications_staff_id_fkey') THEN
    ALTER TABLE verifications DROP CONSTRAINT verifications_staff_id_fkey;
  END IF;
END $$;

ALTER TABLE verifications
  ADD CONSTRAINT verifications_staff_id_fkey
  FOREIGN KEY (staff_id) REFERENCES users(user_id) ON DELETE SET NULL;

-- 6. Fix items disposition_by foreign key constraint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'items_disposition_by_fkey') THEN
    ALTER TABLE items DROP CONSTRAINT items_disposition_by_fkey;
  END IF;
END $$;

ALTER TABLE items
  ADD CONSTRAINT items_disposition_by_fkey
  FOREIGN KEY (disposition_by) REFERENCES users(user_id) ON DELETE SET NULL;

-- 7. Fix claims claimant foreign key constraint (delete user cascades to their claims)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'claims_claimant_id_fkey') THEN
    ALTER TABLE claims DROP CONSTRAINT claims_claimant_id_fkey;
  END IF;
END $$;

ALTER TABLE claims
  ADD CONSTRAINT claims_claimant_id_fkey
  FOREIGN KEY (claimant_id) REFERENCES users(user_id) ON DELETE CASCADE;
