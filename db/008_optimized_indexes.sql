-- ============================================================================
-- Migration 008: Optimized Composite & Partial Indexes for High-Scale Workloads
-- ============================================================================
-- Addresses critical bottlenecks identified in production query analysis:
-- 1. Public catalog pagination & filtering (item_type, status, date_reported, created_at)
-- 2. Correlated item thumbnail subquery on item_images (item_id, uploaded_at)
-- 3. Staff review queue partial indexes for active triage queues
-- 4. User-centric report & claim filtering (reporter_id, claimant_id)
-- 5. Real-time unread notification badge polling partial index
-- 6. Item lifecycle status audit and foreign key performance
-- ============================================================================

-- 1. Public Catalog & Item Filter Composite Index
-- Optimizes GET /api/items (type, status, date_reported sorting & created_at secondary sort)
CREATE INDEX IF NOT EXISTS idx_items_type_status_dates
  ON items (item_type, status, date_reported DESC, created_at DESC);

-- 2. Category Lookup & Filtering Index
-- Optimizes items category filter and JOINs with categories table
CREATE INDEX IF NOT EXISTS idx_items_category
  ON items (category_id);

-- 3. Correlated Image Lookup Index
-- Optimizes the correlated subquery in publicItemFields:
--   (SELECT image_path FROM item_images WHERE item_id = i.item_id ORDER BY uploaded_at LIMIT 1)
-- Replaces sequential scans on item_images with an instantaneous index scan
CREATE INDEX IF NOT EXISTS idx_item_images_item_uploaded
  ON item_images (item_id, uploaded_at ASC);

-- 4. User's Personal Reports Index
-- Optimizes GET /api/my/reports (WHERE reporter_id = $1 ORDER BY created_at DESC)
CREATE INDEX IF NOT EXISTS idx_items_reporter_created
  ON items (reporter_id, created_at DESC)
  WHERE reporter_id IS NOT NULL;

-- 5. Staff Review Queue Partial Index
-- Only indexes active items requiring staff action (reported or under_review)
-- Drastically reduces index footprint and makes staff triage queue instantaneous
CREATE INDEX IF NOT EXISTS idx_items_review_queue
  ON items (item_type, created_at ASC)
  WHERE status IN ('reported', 'under_review');

-- 6. Active Resolved Cases Partial Index
-- Optimizes review workspace active cases query
CREATE INDEX IF NOT EXISTS idx_items_active_cases
  ON items (item_type, status, updated_at DESC)
  WHERE status IN ('found', 'claimed', 'completed');

-- 7. Matched Pair Relationship Indexes
-- Optimizes lost/found bi-directional pairing lookups and status cascades
CREATE INDEX IF NOT EXISTS idx_items_matched_lost
  ON items (matched_lost_id)
  WHERE matched_lost_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_items_matched_found
  ON items (matched_found_id)
  WHERE matched_found_id IS NOT NULL;

-- 8. User Claims History Index
-- Optimizes GET /api/my/reports and personal claim history lookups
CREATE INDEX IF NOT EXISTS idx_claims_claimant_status_date
  ON claims (claimant_id, status, claim_date DESC);

-- 9. Claim Status & Concurrency Conflict Check Index
-- Optimizes verification workflows (checking if item already has an approved claim)
CREATE INDEX IF NOT EXISTS idx_claims_item_status
  ON claims (item_id, status);

-- 10. Real-time Unread Notification Badge Partial Index
-- Tiny index covering only unread notifications for high-frequency polling
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications (user_id)
  WHERE is_read = false;

-- 11. User Notification Timeline Index
-- Optimizes GET /api/notifications (WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50)
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications (user_id, created_at DESC);

-- 12. Item Status Log Audit Timeline Index
-- Optimizes status transition history lookups
CREATE INDEX IF NOT EXISTS idx_item_status_log_item_changed
  ON item_status_log (item_id, changed_at DESC);

-- 13. Admin User Listing Index
-- Optimizes GET /api/admin/users (ORDER BY created_at DESC)
CREATE INDEX IF NOT EXISTS idx_users_created_at
  ON users (created_at DESC);
