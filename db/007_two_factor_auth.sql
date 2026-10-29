-- 007_two_factor_auth.sql
-- Two-Factor Authentication (TOTP / Google Authenticator) and backup recovery codes

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS two_factor_secret TEXT,
  ADD COLUMN IF NOT EXISTS two_factor_temp_secret TEXT,
  ADD COLUMN IF NOT EXISTS two_factor_backup_codes JSONB,
  ADD COLUMN IF NOT EXISTS two_factor_confirmed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_two_factor_enabled ON users (two_factor_enabled) WHERE two_factor_enabled = true;
