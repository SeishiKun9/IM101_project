-- Migration 004: User Profile, Contact Number, Privacy Preferences, and Theme Settings

ALTER TABLE users ADD COLUMN IF NOT EXISTS contact_number VARCHAR(30);
ALTER TABLE users ADD COLUMN IF NOT EXISTS default_anonymous BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS default_hide_phone BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS theme_preference VARCHAR(10) NOT NULL DEFAULT 'light';
ALTER TABLE users ALTER COLUMN theme_preference SET DEFAULT 'light';
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_theme_preference_check'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_theme_preference_check
      CHECK (theme_preference IN ('light', 'dark', 'system'));
  END IF;
END $$;
