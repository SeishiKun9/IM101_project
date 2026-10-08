/**
 * Formats an item's location for display across cards, modals, and lists.
 * Supports building, floor, room/location, locationDescription, and snapshot fallbacks.
 */
export function formatLocation(item) {
  if (!item) return "";

  // If a snapshot is stored, we can also inspect it
  const building = item.building || item.locationSnapshot?.buildingName || "";
  const floor = item.floor || item.locationSnapshot?.floorName || "";
  const location = item.location || item.locationSnapshot?.roomName || "";
  const description =
    item.locationDescription || item.locationSnapshot?.description || "";

  const parts = [];
  if (building) parts.push(building);
  if (floor && floor !== building) parts.push(floor);
  if (location && location !== building && location !== floor) {
    parts.push(location);
  }
  if (description) {
    parts.push(`(${description})`);
  }

  if (parts.length > 0) {
    return parts.join(" · ");
  }

  return item.location || "Location not specified";
}

/**
 * Normalizes map coordinates for CSS positioning.
 * Accepts either 0..1 normalized coords or 0..100 percentage values.
 */
export function normalizeCoord(val) {
  if (val === null || val === undefined || val === "") return 0;
  const num = parseFloat(val);
  if (Number.isNaN(num)) return 0;
  // If <= 1.0 (and not 0), treat as normalized 0..1 fraction and convert to %
  if (num > 0 && num <= 1.0) {
    return (num * 100).toFixed(2);
  }
  return num.toFixed(2);
}
