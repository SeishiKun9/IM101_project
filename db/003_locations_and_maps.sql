-- Migration 003: Buildings, Floors, Rooms, Campus Maps & Versioning

CREATE TABLE IF NOT EXISTS buildings (
  building_id BIGSERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  description TEXT,
  display_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_buildings_name_lower_unique 
  ON buildings (LOWER(TRIM(name)));

CREATE TABLE IF NOT EXISTS floors (
  floor_id BIGSERIAL PRIMARY KEY,
  building_id BIGINT NOT NULL REFERENCES buildings (building_id) ON DELETE RESTRICT,
  name VARCHAR(120) NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_floors_building_name_lower_unique 
  ON floors (building_id, LOWER(TRIM(name)));

CREATE TABLE IF NOT EXISTS rooms (
  room_id BIGSERIAL PRIMARY KEY,
  floor_id BIGINT NOT NULL REFERENCES floors (floor_id) ON DELETE RESTRICT,
  name VARCHAR(120) NOT NULL,
  room_code VARCHAR(50),
  description TEXT,
  display_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rooms_floor_name_lower_unique 
  ON rooms (floor_id, LOWER(TRIM(name)));

CREATE TABLE IF NOT EXISTS campus_maps (
  map_id BIGSERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  description TEXT,
  image_path TEXT NOT NULL,
  version_number INT NOT NULL DEFAULT 1,
  file_size BIGINT,
  mime_type VARCHAR(60),
  is_active BOOLEAN NOT NULL DEFAULT false,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  uploaded_by BIGINT REFERENCES users (user_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campus_maps_active ON campus_maps (is_active) WHERE is_active = true;

-- Adapt items table with location foreign keys and snapshot mechanism
ALTER TABLE items ADD COLUMN IF NOT EXISTS building_id BIGINT REFERENCES buildings (building_id) ON DELETE SET NULL;
ALTER TABLE items ADD COLUMN IF NOT EXISTS floor_id BIGINT REFERENCES floors (floor_id) ON DELETE SET NULL;
ALTER TABLE items ADD COLUMN IF NOT EXISTS room_id BIGINT REFERENCES rooms (room_id) ON DELETE SET NULL;
ALTER TABLE items ADD COLUMN IF NOT EXISTS map_id BIGINT REFERENCES campus_maps (map_id) ON DELETE RESTRICT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS location_description TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS location_snapshot JSONB;

ALTER TABLE items ALTER COLUMN location_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_items_building ON items (building_id);
CREATE INDEX IF NOT EXISTS idx_items_floor ON items (floor_id);
CREATE INDEX IF NOT EXISTS idx_items_room ON items (room_id);
CREATE INDEX IF NOT EXISTS idx_items_map ON items (map_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_table_record ON audit_logs (table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_time ON audit_logs (action_time DESC);
