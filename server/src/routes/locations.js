import express from "express";

export function createLocationsRouter({ pool, asyncRoute, requireDatabase }) {
  const router = express.Router();

  // Public / Authenticated: Get active location hierarchy for selectors
  router.get(
    ["/", "/api/locations"],
    requireDatabase,
    asyncRoute(async (req, res) => {
      const buildingsQuery = await pool.query(
        `SELECT building_id AS id, name, description, display_order AS "displayOrder"
         FROM buildings
         WHERE is_active = true AND is_archived = false
         ORDER BY display_order ASC, name ASC`,
      );

      const floorsQuery = await pool.query(
        `SELECT floor_id AS id, building_id AS "buildingId", name, display_order AS "displayOrder"
         FROM floors
         WHERE is_active = true AND is_archived = false
         ORDER BY display_order ASC, name ASC`,
      );

      const roomsQuery = await pool.query(
        `SELECT room_id AS id, floor_id AS "floorId", name, room_code AS "roomCode",
                description, display_order AS "displayOrder"
         FROM rooms
         WHERE is_active = true AND is_archived = false
         ORDER BY display_order ASC, name ASC`,
      );

      const roomsByFloor = new Map();
      for (const room of roomsQuery.rows) {
        if (!roomsByFloor.has(room.floorId)) roomsByFloor.set(room.floorId, []);
        roomsByFloor.get(room.floorId).push(room);
      }

      const floorsByBuilding = new Map();
      for (const floor of floorsQuery.rows) {
        floor.rooms = roomsByFloor.get(floor.id) || [];
        if (!floorsByBuilding.has(floor.buildingId))
          floorsByBuilding.set(floor.buildingId, []);
        floorsByBuilding.get(floor.buildingId).push(floor);
      }

      const hierarchy = buildingsQuery.rows.map((b) => ({
        ...b,
        floors: floorsByBuilding.get(b.id) || [],
      }));

      res.json(hierarchy);
    }),
  );

  return router;
}
