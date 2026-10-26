import fs from "fs";
import path from "path";

function escapeXml(unsafe) {
  if (unsafe === null || unsafe === undefined) return "";
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const colors = {
  bg: "#080C14",
  grid: "#131C2E",
  cardBg: "#0F172A",
  cardBorder: "#1E293B",
  cardBorderActive: "#334155",
  textPrimary: "#F8FAFC",
  textSecondary: "#94A3B8",
  textType: "#7DD3FC",
  pkBadge: "#F59E0B",
  fkBadge: "#38BDF8",
  uqBadge: "#A78BFA",
  
  domains: {
    user: { grad1: "#2563EB", grad2: "#1D4ED8", tag: "Identity &amp; RBAC", stroke: "#3B82F6" },
    location: { grad1: "#0891B2", grad2: "#0E7490", tag: "Campus Hierarchy", stroke: "#06B6D4" },
    category: { grad1: "#059669", grad2: "#047857", tag: "Classification", stroke: "#10B981" },
    item: { grad1: "#4F46E5", grad2: "#3730A3", tag: "Item Registry &amp; Tracking", stroke: "#6366F1" },
    claim: { grad1: "#EA580C", grad2: "#C2410C", tag: "Claims &amp; Verification", stroke: "#F97316" },
    audit: { grad1: "#7C3AED", grad2: "#5B21B6", tag: "System Audit", stroke: "#8B5CF6" },
    map: { grad1: "#0D9488", grad2: "#0F766E", tag: "Interactive Maps", stroke: "#14B8A6" }
  }
};

// Canvas: 3300 x 2150 with 300px channels between columns
const tables = [
  // --- COLUMN 1: Location Hierarchy (x = 80, width = 460) ---
  {
    id: "buildings",
    title: "buildings",
    domain: "location",
    x: 80,
    y: 140,
    width: 460,
    columns: [
      { name: "building_id", type: "BIGSERIAL", key: "PK", notNull: true, notes: "Auto ID" },
      { name: "name", type: "VARCHAR(120)", key: "UQ", notNull: true, notes: "Unique building name" },
      { name: "description", type: "TEXT", key: "", notes: "Optional info" },
      { name: "display_order", type: "INT", key: "", def: "0", notNull: true, notes: "UI sort" },
      { name: "is_active", type: "BOOLEAN", key: "", def: "true", notNull: true, notes: "Active flag" },
      { name: "is_archived", type: "BOOLEAN", key: "", def: "false", notNull: true, notes: "Soft-delete" },
      { name: "created_at", type: "TIMESTAMPTZ", key: "", def: "now()", notNull: true },
      { name: "updated_at", type: "TIMESTAMPTZ", key: "", def: "now()", notNull: true }
    ]
  },
  {
    id: "floors",
    title: "floors",
    domain: "location",
    x: 80,
    y: 470,
    width: 460,
    columns: [
      { name: "floor_id", type: "BIGSERIAL", key: "PK", notNull: true, notes: "Auto ID" },
      { name: "building_id", type: "BIGINT", key: "FK", ref: "buildings(building_id)", notNull: true, notes: "RESTRICT" },
      { name: "name", type: "VARCHAR(120)", key: "", notNull: true, notes: "Floor label" },
      { name: "display_order", type: "INT", key: "", def: "0", notNull: true, notes: "UI sort" },
      { name: "is_active", type: "BOOLEAN", key: "", def: "true", notNull: true },
      { name: "is_archived", type: "BOOLEAN", key: "", def: "false", notNull: true },
      { name: "created_at", type: "TIMESTAMPTZ", key: "", def: "now()", notNull: true },
      { name: "updated_at", type: "TIMESTAMPTZ", key: "", def: "now()", notNull: true }
    ]
  },
  {
    id: "rooms",
    title: "rooms",
    domain: "location",
    x: 80,
    y: 800,
    width: 460,
    columns: [
      { name: "room_id", type: "BIGSERIAL", key: "PK", notNull: true, notes: "Auto ID" },
      { name: "floor_id", type: "BIGINT", key: "FK", ref: "floors(floor_id)", notNull: true, notes: "RESTRICT" },
      { name: "name", type: "VARCHAR(120)", key: "", notNull: true, notes: "Room name/no" },
      { name: "room_code", type: "VARCHAR(50)", key: "", notes: "Office/lab code" },
      { name: "description", type: "TEXT", key: "" },
      { name: "display_order", type: "INT", key: "", def: "0", notNull: true },
      { name: "is_active", type: "BOOLEAN", key: "", def: "true", notNull: true },
      { name: "is_archived", type: "BOOLEAN", key: "", def: "false", notNull: true },
      { name: "created_at", type: "TIMESTAMPTZ", key: "", def: "now()", notNull: true },
      { name: "updated_at", type: "TIMESTAMPTZ", key: "", def: "now()", notNull: true }
    ]
  },
  {
    id: "campus_maps",
    title: "campus_maps",
    domain: "map",
    x: 80,
    y: 1180,
    width: 460,
    columns: [
      { name: "map_id", type: "BIGSERIAL", key: "PK", notNull: true, notes: "Auto ID" },
      { name: "name", type: "VARCHAR(120)", key: "", notNull: true, notes: "Map title" },
      { name: "description", type: "TEXT", key: "" },
      { name: "image_path", type: "TEXT", key: "", notNull: true, notes: "URI path" },
      { name: "version_number", type: "INT", key: "", def: "1", notNull: true, notes: "Rev no" },
      { name: "file_size", type: "BIGINT", key: "" },
      { name: "mime_type", type: "VARCHAR(60)", key: "" },
      { name: "is_active", type: "BOOLEAN", key: "", def: "false", notNull: true, notes: "Active map" },
      { name: "is_archived", type: "BOOLEAN", key: "", def: "false", notNull: true },
      { name: "uploaded_by", type: "BIGINT", key: "FK", ref: "users(user_id)", notes: "SET NULL" },
      { name: "created_at", type: "TIMESTAMPTZ", key: "", def: "now()", notNull: true },
      { name: "updated_at", type: "TIMESTAMPTZ", key: "", def: "now()", notNull: true }
    ]
  },
  {
    id: "locations",
    title: "locations [Legacy]",
    domain: "location",
    x: 80,
    y: 1610,
    width: 460,
    columns: [
      { name: "location_id", type: "BIGSERIAL", key: "PK", notNull: true, notes: "Auto ID" },
      { name: "location_name", type: "VARCHAR(120)", key: "", notNull: true },
      { name: "building", type: "VARCHAR(100)", key: "", notNull: true },
      { name: "floor", type: "VARCHAR(30)", key: "" }
    ]
  },

  // --- COLUMN 2: Users & Auth + Categories + Audit (x = 840, width = 520) ---
  {
    id: "users",
    title: "users",
    domain: "user",
    x: 840,
    y: 140,
    width: 520,
    columns: [
      { name: "user_id", type: "BIGSERIAL", key: "PK", notNull: true, notes: "Auto ID" },
      { name: "name", type: "VARCHAR(120)", key: "", notNull: true, notes: "Full name" },
      { name: "email", type: "CITEXT", key: "UQ", notNull: true, notes: "Case-insensitive" },
      { name: "password_hash", type: "TEXT", key: "", notNull: true, notes: "Scrypt hash" },
      { name: "password_reset_token_hash", type: "TEXT", key: "", notes: "Recovery token" },
      { name: "password_reset_expires_at", type: "TIMESTAMPTZ", key: "" },
      { name: "role", type: "user_role", key: "", def: "'student'", notNull: true, notes: "student|staff|admin" },
      { name: "contact_number", type: "VARCHAR(30)", key: "", notes: "Phone" },
      { name: "default_anonymous", type: "BOOLEAN", key: "", def: "false", notNull: true },
      { name: "default_hide_phone", type: "BOOLEAN", key: "", def: "true", notNull: true },
      { name: "theme_preference", type: "VARCHAR(10)", key: "", def: "'light'", notNull: true, notes: "light|dark|system" },
      { name: "created_at", type: "TIMESTAMPTZ", key: "", def: "now()", notNull: true },
      { name: "updated_at", type: "TIMESTAMPTZ", key: "", def: "now()", notNull: true }
    ]
  },
  {
    id: "categories",
    title: "categories",
    domain: "category",
    x: 840,
    y: 600,
    width: 520,
    columns: [
      { name: "category_id", type: "BIGSERIAL", key: "PK", notNull: true, notes: "Auto ID" },
      { name: "category_name", type: "VARCHAR(80)", key: "UQ", notNull: true, notes: "Unique name" },
      { name: "description", type: "TEXT", key: "", notes: "Category info" }
    ]
  },
  {
    id: "audit_logs",
    title: "audit_logs",
    domain: "audit",
    x: 840,
    y: 790,
    width: 520,
    columns: [
      { name: "audit_id", type: "BIGSERIAL", key: "PK", notNull: true, notes: "Auto ID" },
      { name: "user_id", type: "BIGINT", key: "FK", ref: "users(user_id)", notes: "SET NULL" },
      { name: "action", type: "VARCHAR(30)", key: "", notNull: true, notes: "INSERT|UPDATE|DELETE" },
      { name: "table_name", type: "VARCHAR(80)", key: "", notNull: true, notes: "Target table" },
      { name: "record_id", type: "BIGINT", key: "", notNull: true, notes: "Target PK ID" },
      { name: "old_data", type: "JSONB", key: "", notes: "Prior snapshot" },
      { name: "new_data", type: "JSONB", key: "", notes: "Post snapshot" },
      { name: "action_time", type: "TIMESTAMPTZ", key: "", def: "now()", notNull: true }
    ]
  },

  // --- COLUMN 3: Central Items Table (x = 1660, width = 660) ---
  {
    id: "items",
    title: "items",
    domain: "item",
    x: 1660,
    y: 140,
    width: 660,
    columns: [
      { name: "item_id", type: "BIGSERIAL", key: "PK", notNull: true, notes: "Auto ID" },
      { name: "reporter_id", type: "BIGINT", key: "FK", ref: "users(user_id)", notNull: true, notes: "RESTRICT" },
      { name: "category_id", type: "BIGINT", key: "FK", ref: "categories(category_id)", notNull: true, notes: "RESTRICT" },
      { name: "location_id", type: "BIGINT", key: "FK", ref: "locations(location_id)", notes: "RESTRICT" },
      { name: "building_id", type: "BIGINT", key: "FK", ref: "buildings(building_id)", notes: "SET NULL" },
      { name: "floor_id", type: "BIGINT", key: "FK", ref: "floors(floor_id)", notes: "SET NULL" },
      { name: "room_id", type: "BIGINT", key: "FK", ref: "rooms(room_id)", notes: "SET NULL" },
      { name: "map_id", type: "BIGINT", key: "FK", ref: "campus_maps(map_id)", notes: "RESTRICT" },
      { name: "location_description", type: "TEXT", key: "" },
      { name: "location_snapshot", type: "JSONB", key: "", notes: "Immutable JSON" },
      { name: "item_type", type: "item_type", key: "", notNull: true, notes: "lost | found" },
      { name: "title", type: "VARCHAR(160)", key: "", notNull: true, notes: "Full-text searchable" },
      { name: "description", type: "TEXT", key: "", notNull: true, notes: "Full-text searchable" },
      { name: "date_reported", type: "DATE", key: "", notNull: true },
      { name: "status", type: "item_status", key: "", def: "'reported'", notNull: true, notes: "Indexed" },
      { name: "reporter_name", type: "VARCHAR(120)", key: "" },
      { name: "contact_phone", type: "VARCHAR(40)", key: "" },
      { name: "is_anonymous", type: "BOOLEAN", key: "", def: "false", notNull: true },
      { name: "hide_phone", type: "BOOLEAN", key: "", def: "true", notNull: true },
      { name: "map_x", type: "NUMERIC(5,2)", key: "", notes: "X pin 0-100%" },
      { name: "map_y", type: "NUMERIC(5,2)", key: "", notes: "Y pin 0-100%" },
      { name: "matched_lost_id", type: "BIGINT", key: "FK", ref: "items(item_id)", notes: "Self-FK" },
      { name: "matched_found_id", type: "BIGINT", key: "FK", ref: "items(item_id)", notes: "Self-FK" },
      { name: "review_lost_id", type: "BIGINT", key: "FK", ref: "items(item_id)", notes: "Self-FK" },
      { name: "finder_name", type: "VARCHAR(120)", key: "" },
      { name: "found_location", type: "TEXT", key: "", notes: "Intake locker" },
      { name: "confirmation_date", type: "TIMESTAMPTZ", key: "" },
      { name: "matched_by", type: "BIGINT", key: "FK", ref: "users(user_id)", notes: "SET NULL" },
      { name: "verifier_notes", type: "TEXT", key: "" },
      { name: "collection_date", type: "TIMESTAMPTZ", key: "" },
      { name: "collected_by", type: "BIGINT", key: "FK", ref: "users(user_id)", notes: "SET NULL" },
      { name: "created_at", type: "TIMESTAMPTZ", key: "", def: "now()", notNull: true },
      { name: "updated_at", type: "TIMESTAMPTZ", key: "", def: "now()", notNull: true }
    ]
  },
  {
    id: "item_images",
    title: "item_images",
    domain: "item",
    x: 1660,
    y: 1140,
    width: 660,
    columns: [
      { name: "image_id", type: "BIGSERIAL", key: "PK", notNull: true, notes: "Auto ID" },
      { name: "item_id", type: "BIGINT", key: "FK", ref: "items(item_id)", notNull: true, notes: "CASCADE" },
      { name: "image_path", type: "TEXT", key: "", notNull: true, notes: "File storage path" },
      { name: "uploaded_at", type: "TIMESTAMPTZ", key: "", def: "now()", notNull: true }
    ]
  },
  {
    id: "item_status_log",
    title: "item_status_log",
    domain: "item",
    x: 1660,
    y: 1350,
    width: 660,
    columns: [
      { name: "status_log_id", type: "BIGSERIAL", key: "PK", notNull: true, notes: "Auto ID" },
      { name: "item_id", type: "BIGINT", key: "FK", ref: "items(item_id)", notNull: true, notes: "CASCADE" },
      { name: "changed_by", type: "BIGINT", key: "FK", ref: "users(user_id)", notNull: true, notes: "RESTRICT" },
      { name: "old_status", type: "item_status", key: "", notes: "Previous state" },
      { name: "new_status", type: "item_status", key: "", notNull: true, notes: "Updated state" },
      { name: "changed_at", type: "TIMESTAMPTZ", key: "", def: "now()", notNull: true }
    ]
  },

  // --- COLUMN 4: Claims & Verifications (x = 2620, width = 540) ---
  {
    id: "claims",
    title: "claims",
    domain: "claim",
    x: 2620,
    y: 140,
    width: 540,
    columns: [
      { name: "claim_id", type: "BIGSERIAL", key: "PK", notNull: true, notes: "Auto ID" },
      { name: "item_id", type: "BIGINT", key: "FK", ref: "items(item_id)", notNull: true, notes: "RESTRICT" },
      { name: "claimant_id", type: "BIGINT", key: "FK", ref: "users(user_id)", notNull: true, notes: "RESTRICT" },
      { name: "claim_date", type: "TIMESTAMPTZ", key: "", def: "now()", notNull: true, notes: "Indexed" },
      { name: "status", type: "claim_status", key: "", def: "'pending'", notNull: true, notes: "pending|approved|rejected" },
      { name: "reviewed_by", type: "BIGINT", key: "FK", ref: "users(user_id)", notes: "SET NULL" },
      { name: "reviewed_at", type: "TIMESTAMPTZ", key: "" },
      { name: "rejection_reason", type: "TEXT", key: "" },
      { name: "collection_date", type: "TIMESTAMPTZ", key: "" },
      { name: "collected_by", type: "BIGINT", key: "FK", ref: "users(user_id)", notes: "SET NULL" }
    ]
  },
  {
    id: "ownership_proofs",
    title: "ownership_proofs",
    domain: "claim",
    x: 2620,
    y: 500,
    width: 540,
    columns: [
      { name: "proof_id", type: "BIGSERIAL", key: "PK", notNull: true, notes: "Auto ID" },
      { name: "claim_id", type: "BIGINT", key: "FK", ref: "claims(claim_id)", notNull: true, notes: "CASCADE" },
      { name: "proof_type", type: "VARCHAR(60)", key: "", notNull: true, notes: "Receipt|Serial|Photo" },
      { name: "submitted_at", type: "TIMESTAMPTZ", key: "", def: "now()", notNull: true }
    ]
  },
  {
    id: "verifications",
    title: "verifications",
    domain: "claim",
    x: 2620,
    y: 710,
    width: 540,
    columns: [
      { name: "verification_id", type: "BIGSERIAL", key: "PK", notNull: true, notes: "Auto ID" },
      { name: "claim_id", type: "BIGINT", key: "FK", ref: "claims(claim_id)", notNull: true, notes: "CASCADE" },
      { name: "staff_id", type: "BIGINT", key: "FK", ref: "users(user_id)", notNull: true, notes: "RESTRICT" },
      { name: "result", type: "BOOLEAN", key: "", notNull: true, notes: "Pass/Fail" },
      { name: "notes", type: "TEXT", key: "", notNull: true, notes: "Audit remarks" },
      { name: "verified_at", type: "TIMESTAMPTZ", key: "", def: "now()", notNull: true }
    ]
  }
];

// Explicit Relationships with Detailed Cardinalities (ONE-TO-MANY vs ONE-TO-ONE)
const relationships = [
  {
    fromTable: "floors", fromCol: "building_id",
    toTable: "buildings", toCol: "building_id",
    label: "contains floors", cardinality: "ONE-TO-MANY (1:N)", action: "RESTRICT",
    color: "#06B6D4", channel: "col1_loop", offset: 50
  },
  {
    fromTable: "rooms", fromCol: "floor_id",
    toTable: "floors", toCol: "floor_id",
    label: "contains rooms", cardinality: "ONE-TO-MANY (1:N)", action: "RESTRICT",
    color: "#06B6D4", channel: "col1_loop", offset: 50
  },
  {
    fromTable: "campus_maps", fromCol: "uploaded_by",
    toTable: "users", toCol: "user_id",
    label: "uploaded by admin", cardinality: "ONE-TO-MANY (1:N)", action: "SET NULL",
    color: "#14B8A6", channel: "channel_1_2", offset: 0
  },
  {
    fromTable: "items", fromCol: "reporter_id",
    toTable: "users", toCol: "user_id",
    label: "reported by user", cardinality: "ONE-TO-MANY (1:N)", action: "RESTRICT",
    color: "#3B82F6", channel: "channel_2_3", offset: -30
  },
  {
    fromTable: "items", fromCol: "category_id",
    toTable: "categories", toCol: "category_id",
    label: "classified under", cardinality: "ONE-TO-MANY (1:N)", action: "RESTRICT",
    color: "#10B981", channel: "channel_2_3", offset: 30
  },
  {
    fromTable: "items", fromCol: "building_id",
    toTable: "buildings", toCol: "building_id",
    label: "building location", cardinality: "ONE-TO-MANY (1:N)", action: "SET NULL",
    color: "#06B6D4", channel: "over_top", offset: -40
  },
  {
    fromTable: "items", fromCol: "floor_id",
    toTable: "floors", toCol: "floor_id",
    label: "floor location", cardinality: "ONE-TO-MANY (1:N)", action: "SET NULL",
    color: "#06B6D4", channel: "under_users", offset: 0
  },
  {
    fromTable: "items", fromCol: "room_id",
    toTable: "rooms", toCol: "room_id",
    label: "room location", cardinality: "ONE-TO-MANY (1:N)", action: "SET NULL",
    color: "#06B6D4", channel: "channel_1_3", offset: 40
  },
  {
    fromTable: "items", fromCol: "map_id",
    toTable: "campus_maps", toCol: "map_id",
    label: "pinned map coordinates", cardinality: "ONE-TO-MANY (1:N)", action: "RESTRICT",
    color: "#14B8A6", channel: "channel_1_3", offset: 80
  },
  {
    fromTable: "item_images", fromCol: "item_id",
    toTable: "items", toCol: "item_id",
    label: "photo gallery", cardinality: "ONE-TO-MANY (1:N)", action: "CASCADE",
    color: "#6366F1", channel: "col3_loop", offset: 40
  },
  {
    fromTable: "item_status_log", fromCol: "item_id",
    toTable: "items", toCol: "item_id",
    label: "status transitions", cardinality: "ONE-TO-MANY (1:N)", action: "CASCADE",
    color: "#6366F1", channel: "col3_loop", offset: 70
  },
  {
    fromTable: "item_status_log", fromCol: "changed_by",
    toTable: "users", toCol: "user_id",
    label: "status changed by", cardinality: "ONE-TO-MANY (1:N)", action: "RESTRICT",
    color: "#3B82F6", channel: "channel_2_3", offset: 90
  },
  {
    fromTable: "claims", fromCol: "item_id",
    toTable: "items", toCol: "item_id",
    label: "item claimed", cardinality: "ONE-TO-MANY (1:N)", action: "RESTRICT",
    color: "#F97316", channel: "channel_3_4", offset: 0
  },
  {
    fromTable: "claims", fromCol: "claimant_id",
    toTable: "users", toCol: "user_id",
    label: "claimant profile", cardinality: "ONE-TO-MANY (1:N)", action: "RESTRICT",
    color: "#3B82F6", channel: "over_items", offset: -60
  },
  {
    fromTable: "ownership_proofs", fromCol: "claim_id",
    toTable: "claims", toCol: "claim_id",
    label: "proof attachments", cardinality: "ONE-TO-MANY (1:N)", action: "CASCADE",
    color: "#F97316", channel: "col4_loop", offset: 40
  },
  {
    fromTable: "verifications", fromCol: "claim_id",
    toTable: "claims", toCol: "claim_id",
    label: "staff verification", cardinality: "ONE-TO-ONE (1:1)", action: "CASCADE",
    color: "#F97316", channel: "col4_loop", offset: 70
  },
  {
    fromTable: "verifications", fromCol: "staff_id",
    toTable: "users", toCol: "user_id",
    label: "verified by staff", cardinality: "ONE-TO-MANY (1:N)", action: "RESTRICT",
    color: "#2563EB", channel: "bottom_cross", offset: 60
  },
  {
    fromTable: "audit_logs", fromCol: "user_id",
    toTable: "users", toCol: "user_id",
    label: "logged actor", cardinality: "ONE-TO-MANY (1:N)", action: "SET NULL",
    color: "#8B5CF6", channel: "col2_loop", offset: 40
  }
];

const ROW_HEIGHT = 26;
const HEADER_HEIGHT = 44;
const PADDING_BOTTOM = 14;

// Calculate table coordinates and heights
const tableMap = {};
tables.forEach(t => {
  t.height = HEADER_HEIGHT + t.columns.length * ROW_HEIGHT + PADDING_BOTTOM;
  tableMap[t.id] = t;
});

function getColY(table, colName) {
  const index = table.columns.findIndex(c => c.name === colName);
  if (index === -1) return table.y + HEADER_HEIGHT + 13;
  return table.y + HEADER_HEIGHT + index * ROW_HEIGHT + 13;
}

let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="3300" height="2150" viewBox="0 0 3300 2150" xmlns="http://www.w3.org/2000/svg" style="background:#080C14; font-family:'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif;">
  <defs>
    <!-- Background Grid Pattern -->
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#121A2B" stroke-width="1" opacity="0.75"/>
    </pattern>
    
    <!-- Gradients by Domain -->
    <linearGradient id="grad-user" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2563EB"/><stop offset="100%" stop-color="#1D4ED8"/>
    </linearGradient>
    <linearGradient id="grad-location" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0891B2"/><stop offset="100%" stop-color="#0E7490"/>
    </linearGradient>
    <linearGradient id="grad-category" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#059669"/><stop offset="100%" stop-color="#047857"/>
    </linearGradient>
    <linearGradient id="grad-item" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#4F46E5"/><stop offset="100%" stop-color="#3730A3"/>
    </linearGradient>
    <linearGradient id="grad-claim" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#EA580C"/><stop offset="100%" stop-color="#C2410C"/>
    </linearGradient>
    <linearGradient id="grad-audit" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#7C3AED"/><stop offset="100%" stop-color="#5B21B6"/>
    </linearGradient>
    <linearGradient id="grad-map" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0D9488"/><stop offset="100%" stop-color="#0F766E"/>
    </linearGradient>

    <!-- Card Shadow Filter -->
    <filter id="shadow" x="-6%" y="-5%" width="112%" height="114%" filterUnits="userSpaceOnUse">
      <feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#000000" flood-opacity="0.65"/>
    </filter>

    <!-- Badge Shadow Filter -->
    <filter id="badge-shadow" x="-20%" y="-20%" width="140%" height="140%" filterUnits="userSpaceOnUse">
      <feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#000000" flood-opacity="0.8"/>
    </filter>

    <!-- Crow's Foot "Many" (N) Marker -->
    <marker id="crows-foot" viewBox="0 0 16 16" refX="14" refY="8" markerWidth="12" markerHeight="12" orient="auto">
      <path d="M 0 2 L 14 8 L 0 14 M 14 0 L 14 16" fill="none" stroke="#64748B" stroke-width="2"/>
    </marker>

    <!-- "One" (1) Mandatory Marker -->
    <marker id="one-mandatory" viewBox="0 0 16 16" refX="2" refY="8" markerWidth="10" markerHeight="10" orient="auto">
      <path d="M 4 2 L 4 14 M 10 2 L 10 14" fill="none" stroke="#94A3B8" stroke-width="2.2"/>
    </marker>
  </defs>

  <!-- Background Canvas -->
  <rect width="100%" height="100%" fill="#080C14"/>
  <rect width="100%" height="100%" fill="url(#grid)"/>

  <!-- Top Banner / Title Header -->
  <g transform="translate(80, 40)">
    <rect x="0" y="0" width="3080" height="58" rx="10" fill="#0F172A" stroke="#1E293B" stroke-width="1.5"/>
    <text x="28" y="36" fill="#F8FAFC" font-size="21" font-weight="700" letter-spacing="0.5">CAMPUS LOST &amp; FOUND SYSTEM — DETAILED ENTITY-RELATIONSHIP ARCHITECTURE (POSTGRESQL)</text>
    <text x="1800" y="35" fill="#94A3B8" font-size="13.5">Spacious Multi-Channel Layout • Explicit ONE-TO-ONE &amp; ONE-TO-MANY Cardinalities • Top-Level Z-Index Badges</text>
  </g>
`;

// Compute all path curves and badge coordinates
const computedLines = [];
const computedBadges = [];

relationships.forEach((rel) => {
  const fromT = tableMap[rel.fromTable];
  const toT = tableMap[rel.toTable];
  if (!fromT || !toT) return;

  const y1 = getColY(fromT, rel.fromCol);
  const y2 = getColY(toT, rel.toCol);

  let x1, x2, cx1, cx2, midX, midY;

  if (rel.channel === "channel_2_3") {
    // Channel between Col 2 (Users) and Col 3 (Items): x: 1360 to 1660 (mid = 1510)
    x1 = fromT.x; // items left (x = 1660)
    x2 = toT.x + toT.width; // users/categories right (x = 1360)
    midX = 1510 + (rel.offset || 0);
    midY = (y1 + y2) / 2;
    cx1 = midX;
    cx2 = midX;
  } else if (rel.channel === "channel_3_4") {
    // Channel between Col 3 (Items) and Col 4 (Claims): x: 2320 to 2620 (mid = 2470)
    x1 = fromT.x; // claims left (x = 2620)
    x2 = toT.x + toT.width; // items right (x = 2320)
    midX = 2470 + (rel.offset || 0);
    midY = (y1 + y2) / 2;
    cx1 = midX;
    cx2 = midX;
  } else if (rel.channel === "channel_1_2") {
    // Channel between Col 1 (Maps) and Col 2 (Users): x: 540 to 840 (mid = 690)
    x1 = fromT.x + fromT.width;
    x2 = toT.x;
    midX = 690 + (rel.offset || 0);
    midY = (y1 + y2) / 2;
    cx1 = midX;
    cx2 = midX;
  } else if (rel.channel === "channel_1_3") {
    // Long run from Col 1 to Col 3 (route through channel 1_2 and under/over)
    x1 = fromT.x;
    x2 = toT.x + toT.width;
    cx1 = x1 - 80;
    cx2 = x2 + 80;
    midX = 1510 + (rel.offset || 0);
    midY = (y1 + y2) / 2;
  } else if (rel.channel === "col1_loop") {
    // Within Col 1: loop right into Channel 1_2 (x: 540 to 840)
    x1 = fromT.x + fromT.width;
    x2 = toT.x + toT.width;
    const loopX = 540 + (rel.offset || 50);
    cx1 = loopX;
    cx2 = loopX;
    midX = loopX + 30;
    midY = (y1 + y2) / 2;
  } else if (rel.channel === "col2_loop") {
    // Within Col 2: loop right into Channel 2_3
    x1 = fromT.x + fromT.width;
    x2 = toT.x + toT.width;
    const loopX = 1360 + (rel.offset || 50);
    cx1 = loopX;
    cx2 = loopX;
    midX = loopX + 30;
    midY = (y1 + y2) / 2;
  } else if (rel.channel === "col3_loop") {
    // Within Col 3: loop right into Channel 3_4
    x1 = fromT.x + fromT.width;
    x2 = toT.x + toT.width;
    const loopX = 2320 + (rel.offset || 50);
    cx1 = loopX;
    cx2 = loopX;
    midX = loopX + 30;
    midY = (y1 + y2) / 2;
  } else if (rel.channel === "col4_loop") {
    // Within Col 4: loop right of canvas
    x1 = fromT.x + fromT.width;
    x2 = toT.x + toT.width;
    const loopX = 3160 + (rel.offset || 40);
    cx1 = loopX;
    cx2 = loopX;
    midX = Math.min(loopX + 10, 3220);
    midY = (y1 + y2) / 2;
  } else {
    // Fallback curved
    if (fromT.x < toT.x) {
      x1 = fromT.x + fromT.width;
      x2 = toT.x;
      midX = (x1 + x2) / 2;
      cx1 = midX;
      cx2 = midX;
    } else {
      x1 = fromT.x;
      x2 = toT.x + toT.width;
      midX = (x1 + x2) / 2;
      cx1 = midX;
      cx2 = midX;
    }
    midY = (y1 + y2) / 2;
  }

  computedLines.push({
    x1, y1, cx1, cx2, x2, y2,
    color: rel.color,
    fromTable: rel.fromTable,
    toTable: rel.toTable
  });

  const badgeText = `${rel.cardinality} • ${rel.label} (${rel.action})`;
  const badgeWidth = badgeText.length * 6.5 + 24;
  const badgeHeight = 24;

  computedBadges.push({
    x: midX - badgeWidth / 2,
    y: midY - badgeHeight / 2,
    width: badgeWidth,
    height: badgeHeight,
    text: badgeText,
    color: rel.color
  });
});

// LAYER 1: Draw Relationship Connecting Paths (Behind cards)
svg += `\n  <!-- LAYER 1: Relationship Lines -->\n  <g id="relationship-lines" opacity="0.85">\n`;
computedLines.forEach(l => {
  svg += `    <path d="M ${l.x1} ${l.y1} C ${l.cx1} ${l.y1}, ${l.cx2} ${l.y2}, ${l.x2} ${l.y2}"
          fill="none" stroke="${l.color}" stroke-width="2.2"
          marker-start="url(#crows-foot)" marker-end="url(#one-mandatory)"/>\n`;
});
svg += `  </g>\n`;

// LAYER 2: Draw Table Cards
svg += `\n  <!-- LAYER 2: Table Cards -->\n  <g id="table-cards">\n`;
tables.forEach(table => {
  const gradId = `grad-${table.domain}`;
  const dInfo = colors.domains[table.domain];

  svg += `
  <!-- TABLE: ${escapeXml(table.title)} -->
  <g transform="translate(${table.x}, ${table.y})" filter="url(#shadow)">
    <!-- Container Card -->
    <rect x="0" y="0" width="${table.width}" height="${table.height}" rx="10" fill="#0F172A" stroke="#1E293B" stroke-width="1.5"/>

    <!-- Table Header -->
    <rect x="0" y="0" width="${table.width}" height="${HEADER_HEIGHT}" rx="10" fill="url(#${gradId})"/>
    <rect x="0" y="${HEADER_HEIGHT - 10}" width="${table.width}" height="10" fill="url(#${gradId})"/>
    
    <!-- Table Header Text -->
    <text x="16" y="27" fill="#FFFFFF" font-size="15" font-weight="700" letter-spacing="0.3">${escapeXml(table.title)}</text>
    <rect x="${table.width - 160}" y="10" width="146" height="22" rx="6" fill="#000000" fill-opacity="0.25"/>
    <text x="${table.width - 87}" y="25" fill="#E2E8F0" font-size="10.5" font-weight="600" text-anchor="middle">${dInfo.tag}</text>

    <!-- Columns Header Underline -->
    <line x1="0" y1="${HEADER_HEIGHT}" x2="${table.width}" y2="${HEADER_HEIGHT}" stroke="#334155" stroke-width="1"/>
`;

  // Draw Column Rows
  table.columns.forEach((col, idx) => {
    const rowY = HEADER_HEIGHT + idx * ROW_HEIGHT;
    const textY = rowY + 17;
    const isEven = idx % 2 === 0;

    if (isEven) {
      svg += `    <rect x="1" y="${rowY}" width="${table.width - 2}" height="${ROW_HEIGHT}" fill="#1E293B" fill-opacity="0.35"/>\n`;
    }

    // Key Badges
    if (col.key === "PK") {
      svg += `    <rect x="10" y="${rowY + 5}" width="26" height="15" rx="3.5" fill="#D97706" fill-opacity="0.2" stroke="#F59E0B" stroke-width="1"/>
    <text x="23" y="${rowY + 16}" fill="#FBBF24" font-size="9" font-weight="800" text-anchor="middle">PK</text>\n`;
    } else if (col.key === "FK") {
      svg += `    <rect x="10" y="${rowY + 5}" width="26" height="15" rx="3.5" fill="#0284C7" fill-opacity="0.2" stroke="#38BDF8" stroke-width="1"/>
    <text x="23" y="${rowY + 16}" fill="#7DD3FC" font-size="9" font-weight="800" text-anchor="middle">FK</text>\n`;
    } else if (col.key === "UQ") {
      svg += `    <rect x="10" y="${rowY + 5}" width="26" height="15" rx="3.5" fill="#7C3AED" fill-opacity="0.2" stroke="#A78BFA" stroke-width="1"/>
    <text x="23" y="${rowY + 16}" fill="#C4B5FD" font-size="9" font-weight="800" text-anchor="middle">UQ</text>\n`;
    } else {
      svg += `    <circle cx="23" cy="${rowY + 13}" r="2" fill="#475569"/>\n`;
    }

    // Column Name
    const nameColor = col.key === "PK" ? "#F8FAFC" : "#E2E8F0";
    const nameWeight = col.key === "PK" ? "700" : (col.notNull ? "600" : "400");
    svg += `    <text x="44" y="${textY}" fill="${nameColor}" font-size="12" font-weight="${nameWeight}">${escapeXml(col.name)}</text>\n`;

    // Supplementary Note or Reference Tag (if present)
    if (col.ref) {
      svg += `    <text x="220" y="${textY}" fill="#38BDF8" font-size="9.5" font-family="'Consolas', monospace" opacity="0.9">➔ ${escapeXml(col.ref)}</text>\n`;
    } else if (col.notes) {
      svg += `    <text x="220" y="${textY}" fill="#94A3B8" font-size="9.5" font-style="italic" opacity="0.8">${escapeXml(col.notes)}</text>\n`;
    } else if (col.def) {
      svg += `    <text x="220" y="${textY}" fill="#64748B" font-size="9.5" font-family="'Consolas', monospace">def: ${escapeXml(col.def)}</text>\n`;
    }

    // Data Type (Right Aligned)
    svg += `    <text x="${table.width - 16}" y="${textY}" fill="#93C5FD" font-size="11" font-family="'Consolas', 'Courier New', monospace" font-weight="500" text-anchor="end">${escapeXml(col.type)}</text>\n`;
  });

  svg += `  </g>\n`;
});
svg += `  </g>\n`;

// LAYER 3: Architecture and Notation Legend Box (x = 2620, y = 1040)
svg += `
  <!-- LAYER 3: Legend and Architecture Notes -->
  <g transform="translate(2620, 1040)" filter="url(#shadow)">
    <rect x="0" y="0" width="540" height="480" rx="10" fill="#0F172A" stroke="#1E293B" stroke-width="1.5"/>
    <rect x="0" y="0" width="540" height="42" rx="10" fill="#1E293B"/>
    <rect x="0" y="32" width="540" height="10" fill="#1E293B"/>
    <text x="18" y="27" fill="#F8FAFC" font-size="14" font-weight="700">SCHEMA ARCHITECTURE &amp; KEY CONVENTIONS</text>

    <!-- Key Badges Legend -->
    <g transform="translate(18, 56)">
      <rect x="0" y="0" width="26" height="16" rx="3.5" fill="#D97706" fill-opacity="0.2" stroke="#F59E0B" stroke-width="1"/>
      <text x="13" y="12" fill="#FBBF24" font-size="9.5" font-weight="800" text-anchor="middle">PK</text>
      <text x="36" y="12" fill="#CBD5E1" font-size="11.5" font-weight="600">Primary Key (Auto-incrementing BIGSERIAL)</text>

      <rect x="0" y="24" width="26" height="16" rx="3.5" fill="#0284C7" fill-opacity="0.2" stroke="#38BDF8" stroke-width="1"/>
      <text x="13" y="36" fill="#7DD3FC" font-size="9.5" font-weight="800" text-anchor="middle">FK</text>
      <text x="36" y="36" fill="#CBD5E1" font-size="11.5" font-weight="600">Foreign Key (Explicit ON DELETE Action)</text>

      <rect x="0" y="48" width="26" height="16" rx="3.5" fill="#7C3AED" fill-opacity="0.2" stroke="#A78BFA" stroke-width="1"/>
      <text x="13" y="60" fill="#C4B5FD" font-size="9.5" font-weight="800" text-anchor="middle">UQ</text>
      <text x="36" y="60" fill="#CBD5E1" font-size="11.5" font-weight="600">Unique Constraint (Email, Category, Building)</text>
    </g>

    <!-- Cardinality Distinction Guide -->
    <text x="18" y="152" fill="#94A3B8" font-size="11" font-weight="700" letter-spacing="0.5">EXPLICIT CARDINALITY CLASSIFICATION</text>
    <g transform="translate(18, 166)">
      <rect x="0" y="0" width="124" height="20" rx="4" fill="#38BDF8" fill-opacity="0.15" stroke="#38BDF8" stroke-width="1"/>
      <text x="62" y="14" fill="#7DD3FC" font-size="10.5" font-weight="700" text-anchor="middle">ONE-TO-MANY (1:N)</text>
      <text x="134" y="14" fill="#CBD5E1" font-size="11.5">1 Parent record references Multiple child records</text>

      <rect x="0" y="26" width="124" height="20" rx="4" fill="#10B981" fill-opacity="0.15" stroke="#10B981" stroke-width="1"/>
      <text x="62" y="40" fill="#6EE7B7" font-size="10.5" font-weight="700" text-anchor="middle">ONE-TO-ONE (1:1)</text>
      <text x="134" y="40" fill="#CBD5E1" font-size="11.5">Strict 1:1 pair (e.g., Claim Verification decision)</text>

      <text x="0" y="70" fill="#EF4444" font-size="11" font-weight="700">CASCADE:</text>
      <text x="68" y="70" fill="#CBD5E1" font-size="11">Deleting parent automatically purges all child records</text>

      <text x="0" y="88" fill="#F59E0B" font-size="11" font-weight="700">RESTRICT:</text>
      <text x="68" y="88" fill="#CBD5E1" font-size="11">Blocks parent deletion while dependent rows exist</text>

      <text x="0" y="106" fill="#A855F7" font-size="11" font-weight="700">SET NULL:</text>
      <text x="68" y="106" fill="#CBD5E1" font-size="11">Parent deletion retains child record with NULL foreign key</text>
    </g>

    <!-- Triggers and Stored Procedure Highlights -->
    <line x1="18" y1="312" x2="522" y2="312" stroke="#334155" stroke-width="1"/>
    <text x="18" y="334" fill="#94A3B8" font-size="11" font-weight="700">AUTOMATED DATABASE PROCEDURES</text>
    <text x="18" y="356" fill="#CBD5E1" font-size="11.5">• <tspan fill="#38BDF8">set_updated_at</tspan>: Auto-updates timestamps on modification</text>
    <text x="18" y="376" fill="#CBD5E1" font-size="11.5">• <tspan fill="#38BDF8">audit_row_change</tspan>: Full row JSONB diff logged on change</text>
    <text x="18" y="396" fill="#CBD5E1" font-size="11.5">• <tspan fill="#38BDF8">log_item_status</tspan>: Transition audit recorded to item_status_log</text>
    <text x="18" y="416" fill="#CBD5E1" font-size="11.5">• <tspan fill="#F59E0B">approve_claim()</tspan>: ACID transaction verifying &amp; claiming item</text>
  </g>
`;

// LAYER 4: Draw Floating Badges ON TOP OF EVERYTHING (Highest Z-Index)
// This guarantees NO badge text is ever behind any card or image!
svg += `\n  <!-- LAYER 4: Relationship Badges (Top Z-Index: Never Behind Any Card) -->\n  <g id="relationship-badges">\n`;
computedBadges.forEach(b => {
  svg += `    <g transform="translate(${b.x}, ${b.y})" filter="url(#badge-shadow)">
      <rect x="0" y="0" width="${b.width}" height="${b.height}" rx="6" fill="#0A0F1D" stroke="${b.color}" stroke-width="1.4"/>
      <text x="${b.width / 2}" y="16" fill="#F1F5F9" font-size="10.5" font-weight="700" text-anchor="middle" letter-spacing="0.2">${escapeXml(b.text)}</text>
    </g>\n`;
});
svg += `  </g>\n`;

svg += `</svg>\n`;

fs.writeFileSync("c:/Users/User/IM101_project/schema_diagram_detailed.svg", svg, "utf8");
console.log("Successfully generated spacious schema_diagram_detailed.svg (3300x2150) with top z-index badges and explicit 1:1 / 1:N cardinalities!");
