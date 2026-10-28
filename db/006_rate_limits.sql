-- 006_rate_limits.sql
-- Persistent rate limiting store for brute-force & spam protection across server restarts and scale instances

CREATE TABLE IF NOT EXISTS rate_limits (
  key VARCHAR(255) PRIMARY KEY,
  points INTEGER NOT NULL DEFAULT 1,
  expire_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for high-speed expiration pruning and lookup
CREATE INDEX IF NOT EXISTS idx_rate_limits_expire ON rate_limits (expire_at);

