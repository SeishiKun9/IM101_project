import React, { useEffect, useState } from "react";
import { apiRequest } from "../../api/client.js";

export default function LocationMapManagement() {
  const [activeTab, setActiveTab] = useState("buildings"); // "buildings" | "floors" | "rooms" | "maps"
  const [feedback, setFeedback] = useState({ type: "", message: "" });
  const [loading, setLoading] = useState(false);

  // Data states
  const [buildings, setBuildings] = useState([]);
  const [floors, setFloors] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [maps, setMaps] = useState([]);

  // Filter states
  const [buildingSearch, setBuildingSearch] = useState("");
  const [buildingStatus, setBuildingStatus] = useState("all");

  const [floorBuildingFilter, setFloorBuildingFilter] = useState("all");
  const [floorSearch, setFloorSearch] = useState("");
  const [floorStatus, setFloorStatus] = useState("all");

  const [roomBuildingFilter, setRoomBuildingFilter] = useState("all");
  const [roomFloorFilter, setRoomFloorFilter] = useState("all");
  const [roomSearch, setRoomSearch] = useState("");
  const [roomStatus, setRoomStatus] = useState("all");

  // Modals state
  const [buildingModal, setBuildingModal] = useState({
    open: false,
    building: null,
  });
  const [floorModal, setFloorModal] = useState({ open: false, floor: null });
  const [roomModal, setRoomModal] = useState({ open: false, room: null });
  const [mapModal, setMapModal] = useState({ open: false });
  const [previewMap, setPreviewMap] = useState(null);

  // Impact confirmation modal
  const [impactModal, setImpactModal] = useState({
    open: false,
    type: "", // "building" | "floor" | "room" | "map"
    action: "", // "archive" | "delete"
    item: null,
    impact: null,
  });

  function showMessage(type, message) {
    setFeedback({ type, message });
    setTimeout(() => {
      setFeedback((prev) =>
        prev.message === message ? { type: "", message: "" } : prev,
      );
    }, 5000);
  }

  async function loadData() {
    setLoading(true);
    try {
      const [bData, fData, rData, mData] = await Promise.all([
        apiRequest("/admin/locations/buildings"),
        apiRequest("/admin/locations/floors"),
        apiRequest("/admin/locations/rooms"),
        apiRequest("/admin/maps"),
      ]);
      setBuildings(bData);
      setFloors(fData);
      setRooms(rData);
      setMaps(mData);
    } catch (err) {
      showMessage("error", err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  // ----------------------------------------------------
  // Impact check helper before archive or delete
  // ----------------------------------------------------
  async function checkImpact(type, item, action) {
    if (type === "map") {
      setImpactModal({
        open: true,
        type: "map",
        action,
        item,
        impact: {
          isActive: item.status === "active",
          version: item.version,
          name: item.name,
        },
      });
      return;
    }

    try {
      const plural =
        type === "building"
          ? "buildings"
          : type === "floor"
            ? "floors"
            : "rooms";
      const impact = await apiRequest(
        `/admin/locations/${plural}/${item.id}/impact`,
      );
      setImpactModal({
        open: true,
        type,
        action,
        item,
        impact,
      });
    } catch (err) {
      showMessage("error", err.message);
    }
  }

  // ----------------------------------------------------
  // Execution of archive/delete/toggle
  // ----------------------------------------------------
  async function executeImpactAction() {
    const { type, action, item } = impactModal;
    setImpactModal({
      open: false,
      type: "",
      action: "",
      item: null,
      impact: null,
    });

    const plural =
      type === "building"
        ? "buildings"
        : type === "floor"
          ? "floors"
          : type === "room"
            ? "rooms"
            : "maps";

    try {
      if (type === "map") {
        if (action === "archive") {
          await apiRequest(`/admin/maps/${item.id}/archive`, {
            method: "POST",
          });
          showMessage(
            "success",
            `Map "${item.name}" version ${item.version} was archived.`,
          );
        } else if (action === "delete") {
          await apiRequest(`/admin/maps/${item.id}`, { method: "DELETE" });
          showMessage(
            "success",
            `Map "${item.name}" version ${item.version} was permanently deleted.`,
          );
        }
      } else {
        if (action === "archive") {
          await apiRequest(`/admin/locations/${plural}/${item.id}/archive`, {
            method: "POST",
          });
          showMessage(
            "success",
            `${type.charAt(0).toUpperCase() + type.slice(1)} "${item.name}" was archived.`,
          );
        } else if (action === "delete") {
          await apiRequest(`/admin/locations/${plural}/${item.id}`, {
            method: "DELETE",
          });
          showMessage(
            "success",
            `${type.charAt(0).toUpperCase() + type.slice(1)} "${item.name}" was permanently deleted.`,
          );
        }
      }
      loadData();
    } catch (err) {
      showMessage("error", err.message);
    }
  }

  async function handleArchiveInstead() {
    const { type, item } = impactModal;
    setImpactModal({
      open: false,
      type: "",
      action: "",
      item: null,
      impact: null,
    });
    if (!type || !item) return;

    const plural =
      type === "building"
        ? "buildings"
        : type === "floor"
          ? "floors"
          : type === "room"
            ? "rooms"
            : "maps";

    try {
      if (type === "map") {
        await apiRequest(`/admin/maps/${item.id}/archive`, {
          method: "POST",
        });
        showMessage(
          "success",
          `Map "${item.name}" version ${item.version} was archived.`,
        );
      } else {
        await apiRequest(`/admin/locations/${plural}/${item.id}/archive`, {
          method: "POST",
        });
        showMessage(
          "success",
          `${type.charAt(0).toUpperCase() + type.slice(1)} "${item.name}" was archived.`,
        );
      }
      loadData();
    } catch (err) {
      showMessage("error", err.message);
    }
  }

  async function handleRestore(type, item) {
    const plural =
      type === "building" ? "buildings" : type === "floor" ? "floors" : "rooms";
    try {
      await apiRequest(`/admin/locations/${plural}/${item.id}/restore`, {
        method: "POST",
      });
      showMessage(
        "success",
        `${type.charAt(0).toUpperCase() + type.slice(1)} "${item.name}" was restored.`,
      );
      loadData();
    } catch (err) {
      showMessage("error", err.message);
    }
  }

  async function handleToggleActive(type, item) {
    const plural =
      type === "building" ? "buildings" : type === "floor" ? "floors" : "rooms";
    try {
      await apiRequest(`/admin/locations/${plural}/${item.id}`, {
        method: "PUT",
        body: JSON.stringify({ isActive: !item.isActive }),
      });
      showMessage(
        "success",
        `${item.name} is now ${!item.isActive ? "active" : "inactive"}.`,
      );
      loadData();
    } catch (err) {
      showMessage("error", err.message);
    }
  }

  async function handleActivateMap(mapItem) {
    try {
      await apiRequest(`/admin/maps/${mapItem.id}/activate`, {
        method: "POST",
      });
      showMessage(
        "success",
        `Map "${mapItem.name}" v${mapItem.version} is now the active campus map.`,
      );
      loadData();
    } catch (err) {
      showMessage("error", err.message);
    }
  }

  // ----------------------------------------------------
  // Filtered views
  // ----------------------------------------------------
  const filteredBuildings = buildings.filter((b) => {
    const matchesSearch = b.name
      .toLowerCase()
      .includes(buildingSearch.toLowerCase());
    if (!matchesSearch) return false;
    if (buildingStatus === "archived") return b.isArchived;
    if (buildingStatus === "active") return !b.isArchived && b.isActive;
    if (buildingStatus === "inactive") return !b.isArchived && !b.isActive;
    return true;
  });

  const filteredFloors = floors.filter((f) => {
    if (
      floorBuildingFilter !== "all" &&
      String(f.buildingId) !== String(floorBuildingFilter)
    ) {
      return false;
    }
    const matchesSearch = f.name
      .toLowerCase()
      .includes(floorSearch.toLowerCase());
    if (!matchesSearch) return false;
    if (floorStatus === "archived") return f.isArchived;
    if (floorStatus === "active") return !f.isArchived && f.isActive;
    if (floorStatus === "inactive") return !f.isArchived && !f.isActive;
    return true;
  });

  // Dependent floors for room filter
  const roomFilterFloors =
    roomBuildingFilter === "all"
      ? floors
      : floors.filter(
          (f) => String(f.buildingId) === String(roomBuildingFilter),
        );

  const filteredRooms = rooms.filter((r) => {
    if (
      roomBuildingFilter !== "all" &&
      String(r.buildingId) !== String(roomBuildingFilter)
    ) {
      return false;
    }
    if (
      roomFloorFilter !== "all" &&
      String(r.floorId) !== String(roomFloorFilter)
    ) {
      return false;
    }
    const matchesSearch =
      r.name.toLowerCase().includes(roomSearch.toLowerCase()) ||
      (r.code && r.code.toLowerCase().includes(roomSearch.toLowerCase()));
    if (!matchesSearch) return false;
    if (roomStatus === "archived") return r.isArchived;
    if (roomStatus === "active") return !r.isArchived && r.isActive;
    if (roomStatus === "inactive") return !r.isArchived && !r.isActive;
    return true;
  });

  const activeMap = maps.find((m) => m.status === "active");

  return (
    <section className="location-map-management panel">
      <div className="section-header-row">
        <div>
          <p className="eyebrow">ADMINISTRATOR CONTROL</p>
          <h3>Location &amp; Map Management</h3>
          <p className="section-subtext">
            Manage buildings, floors, rooms, and campus map versions. Changes
            update report forms dynamically.
          </p>
        </div>
      </div>

      {feedback.message && (
        <div
          className={`feedback-alert ${feedback.type === "error" ? "feedback-error" : "feedback-success"}`}
        >
          {feedback.message}
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="sub-tabs">
        <button
          type="button"
          className={`sub-tab-btn ${activeTab === "buildings" ? "active" : ""}`}
          onClick={() => setActiveTab("buildings")}
        >
          Buildings ({buildings.length})
        </button>
        <button
          type="button"
          className={`sub-tab-btn ${activeTab === "floors" ? "active" : ""}`}
          onClick={() => setActiveTab("floors")}
        >
          Floors ({floors.length})
        </button>
        <button
          type="button"
          className={`sub-tab-btn ${activeTab === "rooms" ? "active" : ""}`}
          onClick={() => setActiveTab("rooms")}
        >
          Rooms ({rooms.length})
        </button>
        <button
          type="button"
          className={`sub-tab-btn ${activeTab === "maps" ? "active" : ""}`}
          onClick={() => setActiveTab("maps")}
        >
          Campus Maps ({maps.length})
        </button>
      </div>

      {/* ============================================================ */}
      {/* BUILDINGS TAB */}
      {/* ============================================================ */}
      {activeTab === "buildings" && (
        <div className="tab-content">
          <div className="tab-toolbar">
            <div className="toolbar-filters">
              <input
                type="search"
                placeholder="Search building name..."
                value={buildingSearch}
                onChange={(e) => setBuildingSearch(e.target.value)}
                className="search-input"
              />
              <select
                value={buildingStatus}
                onChange={(e) => setBuildingStatus(e.target.value)}
                className="status-filter"
              >
                <option value="all">All statuses</option>
                <option value="active">Active only</option>
                <option value="inactive">Inactive</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <button
              type="button"
              className="primary compact"
              onClick={() => setBuildingModal({ open: true, building: null })}
            >
              + Add building
            </button>
          </div>

          <div className="table-responsive">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Building name</th>
                  <th>Status</th>
                  <th>Floors</th>
                  <th>Rooms</th>
                  <th>Description</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredBuildings.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="empty-cell">
                      No buildings found matching criteria.
                    </td>
                  </tr>
                ) : (
                  filteredBuildings.map((b) => (
                    <tr
                      key={b.id}
                      className={b.isArchived ? "row-archived" : ""}
                    >
                      <td>{b.displayOrder}</td>
                      <td>
                        <strong>{b.name}</strong>
                      </td>
                      <td>
                        <StatusBadge
                          isArchived={b.isArchived}
                          isActive={b.isActive}
                        />
                      </td>
                      <td>{b.floorsCount}</td>
                      <td>{b.roomsCount}</td>
                      <td className="desc-cell">{b.description || "—"}</td>
                      <td>
                        <div className="action-button-group">
                          <button
                            type="button"
                            className="secondary compact"
                            onClick={() =>
                              setBuildingModal({ open: true, building: b })
                            }
                          >
                            Edit
                          </button>
                          {!b.isArchived ? (
                            <>
                              <button
                                type="button"
                                className="secondary compact"
                                onClick={() =>
                                  handleToggleActive("building", b)
                                }
                              >
                                {b.isActive ? "Deactivate" : "Activate"}
                              </button>
                              <button
                                type="button"
                                className="secondary compact"
                                onClick={() =>
                                  checkImpact("building", b, "archive")
                                }
                              >
                                Archive
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="secondary compact"
                              onClick={() => handleRestore("building", b)}
                            >
                              Restore
                            </button>
                          )}
                          <button
                            type="button"
                            className="danger compact"
                            onClick={() => checkImpact("building", b, "delete")}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* FLOORS TAB */}
      {/* ============================================================ */}
      {activeTab === "floors" && (
        <div className="tab-content">
          <div className="tab-toolbar">
            <div className="toolbar-filters">
              <select
                value={floorBuildingFilter}
                onChange={(e) => setFloorBuildingFilter(e.target.value)}
                className="building-filter"
              >
                <option value="all">All buildings</option>
                {buildings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <input
                type="search"
                placeholder="Search floor name..."
                value={floorSearch}
                onChange={(e) => setFloorSearch(e.target.value)}
                className="search-input"
              />
              <select
                value={floorStatus}
                onChange={(e) => setFloorStatus(e.target.value)}
                className="status-filter"
              >
                <option value="all">All statuses</option>
                <option value="active">Active only</option>
                <option value="inactive">Inactive</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <button
              type="button"
              className="primary compact"
              onClick={() => setFloorModal({ open: true, floor: null })}
            >
              + Add floor
            </button>
          </div>

          <div className="table-responsive">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Building</th>
                  <th>Floor name</th>
                  <th>Status</th>
                  <th>Rooms</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredFloors.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="empty-cell">
                      No floors found matching criteria.
                    </td>
                  </tr>
                ) : (
                  filteredFloors.map((f) => (
                    <tr
                      key={f.id}
                      className={f.isArchived ? "row-archived" : ""}
                    >
                      <td>{f.displayOrder}</td>
                      <td>
                        <strong>{f.buildingName}</strong>
                      </td>
                      <td>{f.name}</td>
                      <td>
                        <StatusBadge
                          isArchived={f.isArchived}
                          isActive={f.isActive}
                        />
                      </td>
                      <td>{f.roomsCount}</td>
                      <td>
                        <div className="action-button-group">
                          <button
                            type="button"
                            className="secondary compact"
                            onClick={() =>
                              setFloorModal({ open: true, floor: f })
                            }
                          >
                            Edit
                          </button>
                          {!f.isArchived ? (
                            <>
                              <button
                                type="button"
                                className="secondary compact"
                                onClick={() => handleToggleActive("floor", f)}
                              >
                                {f.isActive ? "Deactivate" : "Activate"}
                              </button>
                              <button
                                type="button"
                                className="secondary compact"
                                onClick={() =>
                                  checkImpact("floor", f, "archive")
                                }
                              >
                                Archive
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="secondary compact"
                              onClick={() => handleRestore("floor", f)}
                            >
                              Restore
                            </button>
                          )}
                          <button
                            type="button"
                            className="danger compact"
                            onClick={() => checkImpact("floor", f, "delete")}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* ROOMS TAB */}
      {/* ============================================================ */}
      {activeTab === "rooms" && (
        <div className="tab-content">
          <div className="tab-toolbar">
            <div className="toolbar-filters">
              <select
                value={roomBuildingFilter}
                onChange={(e) => {
                  setRoomBuildingFilter(e.target.value);
                  setRoomFloorFilter("all");
                }}
                className="building-filter"
              >
                <option value="all">All buildings</option>
                {buildings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <select
                value={roomFloorFilter}
                onChange={(e) => setRoomFloorFilter(e.target.value)}
                className="floor-filter"
              >
                <option value="all">All floors</option>
                {roomFilterFloors.map((f) => (
                  <option key={f.id} value={f.id}>
                    {roomBuildingFilter === "all"
                      ? `${f.buildingName} - ${f.name}`
                      : f.name}
                  </option>
                ))}
              </select>
              <input
                type="search"
                placeholder="Search room name or code..."
                value={roomSearch}
                onChange={(e) => setRoomSearch(e.target.value)}
                className="search-input"
              />
              <select
                value={roomStatus}
                onChange={(e) => setRoomStatus(e.target.value)}
                className="status-filter"
              >
                <option value="all">All statuses</option>
                <option value="active">Active only</option>
                <option value="inactive">Inactive</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <button
              type="button"
              className="primary compact"
              onClick={() => setRoomModal({ open: true, room: null })}
            >
              + Add room
            </button>
          </div>

          <div className="table-responsive">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Building</th>
                  <th>Floor</th>
                  <th>Room name</th>
                  <th>Code</th>
                  <th>Status</th>
                  <th>Description</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRooms.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="empty-cell">
                      No rooms found matching criteria.
                    </td>
                  </tr>
                ) : (
                  filteredRooms.map((r) => (
                    <tr
                      key={r.id}
                      className={r.isArchived ? "row-archived" : ""}
                    >
                      <td>{r.displayOrder}</td>
                      <td>{r.buildingName}</td>
                      <td>{r.floorName}</td>
                      <td>
                        <strong>{r.name}</strong>
                      </td>
                      <td>{r.code || "—"}</td>
                      <td>
                        <StatusBadge
                          isArchived={r.isArchived}
                          isActive={r.isActive}
                        />
                      </td>
                      <td className="desc-cell">{r.description || "—"}</td>
                      <td>
                        <div className="action-button-group">
                          <button
                            type="button"
                            className="secondary compact"
                            onClick={() =>
                              setRoomModal({ open: true, room: r })
                            }
                          >
                            Edit
                          </button>
                          {!r.isArchived ? (
                            <>
                              <button
                                type="button"
                                className="secondary compact"
                                onClick={() => handleToggleActive("room", r)}
                              >
                                {r.isActive ? "Deactivate" : "Activate"}
                              </button>
                              <button
                                type="button"
                                className="secondary compact"
                                onClick={() =>
                                  checkImpact("room", r, "archive")
                                }
                              >
                                Archive
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="secondary compact"
                              onClick={() => handleRestore("room", r)}
                            >
                              Restore
                            </button>
                          )}
                          <button
                            type="button"
                            className="danger compact"
                            onClick={() => checkImpact("room", r, "delete")}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* CAMPUS MAPS TAB */}
      {/* ============================================================ */}
      {activeTab === "maps" && (
        <div className="tab-content">
          <div className="map-management-grid">
            {/* Active Map Card */}
            <div className="active-map-panel">
              <div className="active-map-header">
                <div>
                  <h4>Current active campus map</h4>
                  <p className="section-subtext">
                    Used by clients &amp; verifiers for placing new report pins.
                  </p>
                </div>
                <button
                  type="button"
                  className="primary compact"
                  onClick={() => setMapModal({ open: true })}
                >
                  + Upload replacement map
                </button>
              </div>

              {activeMap ? (
                <div className="active-map-card">
                  <div
                    className="map-image-wrapper clickable"
                    onClick={() => setPreviewMap(activeMap)}
                  >
                    <img
                      src={activeMap.imageUrl}
                      alt={activeMap.name}
                      className="map-preview-img"
                    />
                    <div className="map-overlay-tag">Click to expand</div>
                  </div>
                  <div className="active-map-meta">
                    <div className="meta-row">
                      <span className="meta-title">{activeMap.name}</span>
                      <span className="badge badge-active">
                        Active Version {activeMap.version}
                      </span>
                    </div>
                    {activeMap.description && (
                      <p className="meta-desc">{activeMap.description}</p>
                    )}
                    <div className="meta-footer">
                      <small>
                        Uploaded on{" "}
                        {new Date(activeMap.createdAt).toLocaleDateString()} at{" "}
                        {new Date(activeMap.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </small>
                      <small>
                        Dimensions:{" "}
                        {activeMap.width
                          ? `${activeMap.width} × ${activeMap.height}`
                          : "Original"}
                      </small>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="empty-map-state">
                  <p>
                    <strong>No campus map is currently available.</strong>
                  </p>
                  <p>
                    Users can still submit reports using location dropdowns and
                    written descriptions.
                  </p>
                  <button
                    type="button"
                    className="primary"
                    onClick={() => setMapModal({ open: true })}
                  >
                    Upload Initial Map
                  </button>
                </div>
              )}
            </div>

            {/* Version History Table */}
            <div className="map-history-panel">
              <h4>Map versions &amp; history</h4>
              <p className="section-subtext">
                Historical maps preserve pins for existing reports and are never
                overwritten.
              </p>

              <div className="table-responsive">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Version</th>
                      <th>Preview</th>
                      <th>Name</th>
                      <th>Status</th>
                      <th>Uploaded</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {maps.map((m) => (
                      <tr
                        key={m.id}
                        className={
                          m.status === "archived" ? "row-archived" : ""
                        }
                      >
                        <td>
                          <strong>v{m.version}</strong>
                        </td>
                        <td>
                          <img
                            src={m.imageUrl}
                            alt={m.name}
                            className="map-thumbnail clickable"
                            onClick={() => setPreviewMap(m)}
                          />
                        </td>
                        <td>{m.name}</td>
                        <td>
                          <span
                            className={`badge ${
                              m.status === "active"
                                ? "badge-active"
                                : m.status === "archived"
                                  ? "badge-archived"
                                  : "badge-inactive"
                            }`}
                          >
                            {m.status.toUpperCase()}
                          </span>
                        </td>
                        <td>{new Date(m.createdAt).toLocaleDateString()}</td>
                        <td>
                          <div className="action-button-group">
                            {m.status !== "active" && (
                              <button
                                type="button"
                                className="primary compact"
                                onClick={() => handleActivateMap(m)}
                              >
                                Activate
                              </button>
                            )}
                            {m.status !== "archived" && (
                              <button
                                type="button"
                                className="secondary compact"
                                onClick={() => checkImpact("map", m, "archive")}
                              >
                                Archive
                              </button>
                            )}
                            <button
                              type="button"
                              className="danger compact"
                              onClick={() => checkImpact("map", m, "delete")}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODALS */}
      {/* ============================================================ */}

      {/* Building Modal */}
      {buildingModal.open && (
        <BuildingModal
          building={buildingModal.building}
          onClose={() => setBuildingModal({ open: false, building: null })}
          onSaved={() => {
            setBuildingModal({ open: false, building: null });
            showMessage(
              "success",
              buildingModal.building
                ? "Building updated."
                : "Building created successfully.",
            );
            loadData();
          }}
        />
      )}

      {/* Floor Modal */}
      {floorModal.open && (
        <FloorModal
          floor={floorModal.floor}
          buildings={buildings.filter((b) => !b.isArchived)}
          onClose={() => setFloorModal({ open: false, floor: null })}
          onSaved={() => {
            setFloorModal({ open: false, floor: null });
            showMessage(
              "success",
              floorModal.floor
                ? "Floor updated."
                : "Floor created successfully.",
            );
            loadData();
          }}
        />
      )}

      {/* Room Modal */}
      {roomModal.open && (
        <RoomModal
          room={roomModal.room}
          buildings={buildings.filter((b) => !b.isArchived)}
          floors={floors.filter((f) => !f.isArchived)}
          onClose={() => setRoomModal({ open: false, room: null })}
          onSaved={() => {
            setRoomModal({ open: false, room: null });
            showMessage(
              "success",
              roomModal.room ? "Room updated." : "Room created successfully.",
            );
            loadData();
          }}
        />
      )}

      {/* Map Upload Modal */}
      {mapModal.open && (
        <MapUploadModal
          onClose={() => setMapModal({ open: false })}
          onSaved={(newMap) => {
            setMapModal({ open: false });
            showMessage(
              "success",
              `Map version ${newMap.version} uploaded successfully.`,
            );
            loadData();
          }}
        />
      )}

      {/* Impact / Delete Confirmation Modal */}
      {impactModal.open && (
        <ImpactConfirmModal
          modalState={impactModal}
          onCancel={() =>
            setImpactModal({
              open: false,
              type: "",
              action: "",
              item: null,
              impact: null,
            })
          }
          onConfirm={executeImpactAction}
          onArchiveInstead={handleArchiveInstead}
        />
      )}

      {/* Map Lightbox Preview Modal */}
      {previewMap && (
        <div className="modal-backdrop" onClick={() => setPreviewMap(null)}>
          <div
            className="modal preview-map-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button className="modal-close" onClick={() => setPreviewMap(null)}>
              ×
            </button>
            <p className="eyebrow">CAMPUS MAP PREVIEW</p>
            <h3>
              {previewMap.name} (v{previewMap.version})
            </h3>
            <img
              src={previewMap.imageUrl}
              alt={previewMap.name}
              className="full-map-preview"
            />
          </div>
        </div>
      )}
    </section>
  );
}

// ====================================================================
// Subcomponents
// ====================================================================

function StatusBadge({ isArchived, isActive }) {
  if (isArchived) {
    return <span className="badge badge-archived">Archived</span>;
  }
  return isActive ? (
    <span className="badge badge-active">Active</span>
  ) : (
    <span className="badge badge-inactive">Inactive</span>
  );
}

function BuildingModal({ building, onClose, onSaved }) {
  const [name, setName] = useState(building?.name || "");
  const [description, setDescription] = useState(building?.description || "");
  const [displayOrder, setDisplayOrder] = useState(building?.displayOrder ?? 0);
  const [isActive, setIsActive] = useState(building ? building.isActive : true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!name.trim()) {
      setError("Building name is required.");
      return;
    }
    setSaving(true);
    try {
      if (building) {
        await apiRequest(`/admin/locations/buildings/${building.id}`, {
          method: "PUT",
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim(),
            displayOrder: parseInt(displayOrder, 10) || 0,
            isActive,
          }),
        });
      } else {
        await apiRequest("/admin/locations/buildings", {
          method: "POST",
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim(),
            displayOrder: parseInt(displayOrder, 10) || 0,
            isActive,
          }),
        });
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal form-modal">
        <button className="modal-close" onClick={onClose}>
          ×
        </button>
        <p className="eyebrow">{building ? "EDIT RECORD" : "NEW RECORD"}</p>
        <h3>
          {building ? `Edit Building: ${building.name}` : "Add New Building"}
        </h3>

        <form onSubmit={handleSubmit} className="mgmt-form">
          <label>
            Building Name *
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Scanlon, Bates Building"
            />
          </label>

          <label>
            Description (optional)
            <textarea
              rows="3"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief details about facilities, entrance, or wings"
            />
          </label>

          <div className="form-row">
            <label>
              Display Order
              <input
                type="number"
                value={displayOrder}
                onChange={(e) => setDisplayOrder(e.target.value)}
              />
            </label>
            <label className="checkbox-label" style={{ marginTop: "24px" }}>
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              Active for new reports
            </label>
          </div>

          {error && <p className="form-error">{error}</p>}

          <div className="modal-actions">
            <button
              type="button"
              className="secondary"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button type="submit" className="primary" disabled={saving}>
              {saving
                ? "Saving..."
                : building
                  ? "Update building"
                  : "Create building"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FloorModal({ floor, buildings, onClose, onSaved }) {
  const [buildingId, setBuildingId] = useState(
    floor?.buildingId || (buildings[0]?.id ?? ""),
  );
  const [name, setName] = useState(floor?.name || "");
  const [displayOrder, setDisplayOrder] = useState(floor?.displayOrder ?? 0);
  const [isActive, setIsActive] = useState(floor ? floor.isActive : true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!name.trim()) {
      setError("Floor name is required.");
      return;
    }
    if (!buildingId) {
      setError("Please select a building.");
      return;
    }
    setSaving(true);
    try {
      if (floor) {
        await apiRequest(`/admin/locations/floors/${floor.id}`, {
          method: "PUT",
          body: JSON.stringify({
            buildingId: parseInt(buildingId, 10),
            name: name.trim(),
            displayOrder: parseInt(displayOrder, 10) || 0,
            isActive,
          }),
        });
      } else {
        await apiRequest("/admin/locations/floors", {
          method: "POST",
          body: JSON.stringify({
            buildingId: parseInt(buildingId, 10),
            name: name.trim(),
            displayOrder: parseInt(displayOrder, 10) || 0,
            isActive,
          }),
        });
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal form-modal">
        <button className="modal-close" onClick={onClose}>
          ×
        </button>
        <p className="eyebrow">{floor ? "EDIT RECORD" : "NEW RECORD"}</p>
        <h3>{floor ? `Edit Floor: ${floor.name}` : "Add New Floor"}</h3>

        <form onSubmit={handleSubmit} className="mgmt-form">
          <label>
            Belongs to Building *
            <select
              value={buildingId}
              onChange={(e) => setBuildingId(e.target.value)}
              required
            >
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Floor Name *
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ground Floor, 2nd Floor, Basement, Roof Deck"
            />
          </label>

          <div className="form-row">
            <label>
              Display Order
              <input
                type="number"
                value={displayOrder}
                onChange={(e) => setDisplayOrder(e.target.value)}
              />
            </label>
            <label className="checkbox-label" style={{ marginTop: "24px" }}>
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              Active for new reports
            </label>
          </div>

          {error && <p className="form-error">{error}</p>}

          <div className="modal-actions">
            <button
              type="button"
              className="secondary"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button type="submit" className="primary" disabled={saving}>
              {saving ? "Saving..." : floor ? "Update floor" : "Create floor"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RoomModal({ room, buildings, floors, onClose, onSaved }) {
  const initialBuildingId = room?.buildingId || (buildings[0]?.id ?? "");
  const [buildingId, setBuildingId] = useState(initialBuildingId);

  // Filter floors by selected building
  const availableFloors = floors.filter(
    (f) => String(f.buildingId) === String(buildingId),
  );

  const initialFloorId =
    room?.floorId && String(room.buildingId) === String(buildingId)
      ? room.floorId
      : (availableFloors[0]?.id ?? "");

  const [floorId, setFloorId] = useState(initialFloorId);
  const [name, setName] = useState(room?.name || "");
  const [code, setCode] = useState(room?.code || "");
  const [description, setDescription] = useState(room?.description || "");
  const [displayOrder, setDisplayOrder] = useState(room?.displayOrder ?? 0);
  const [isActive, setIsActive] = useState(room ? room.isActive : true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // When building changes, update floor options
  function handleBuildingChange(e) {
    const newBId = e.target.value;
    setBuildingId(newBId);
    const newFloors = floors.filter(
      (f) => String(f.buildingId) === String(newBId),
    );
    setFloorId(newFloors[0]?.id ?? "");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!name.trim()) {
      setError("Room name is required.");
      return;
    }
    if (!floorId) {
      setError(
        "Please select a floor. If none exist, add a floor to this building first.",
      );
      return;
    }
    setSaving(true);
    try {
      if (room) {
        await apiRequest(`/admin/locations/rooms/${room.id}`, {
          method: "PUT",
          body: JSON.stringify({
            floorId: parseInt(floorId, 10),
            name: name.trim(),
            code: code.trim(),
            description: description.trim(),
            displayOrder: parseInt(displayOrder, 10) || 0,
            isActive,
          }),
        });
      } else {
        await apiRequest("/admin/locations/rooms", {
          method: "POST",
          body: JSON.stringify({
            floorId: parseInt(floorId, 10),
            name: name.trim(),
            code: code.trim(),
            description: description.trim(),
            displayOrder: parseInt(displayOrder, 10) || 0,
            isActive,
          }),
        });
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal form-modal">
        <button className="modal-close" onClick={onClose}>
          ×
        </button>
        <p className="eyebrow">{room ? "EDIT RECORD" : "NEW RECORD"}</p>
        <h3>{room ? `Edit Room: ${room.name}` : "Add New Room"}</h3>

        <form onSubmit={handleSubmit} className="mgmt-form">
          <div className="form-row">
            <label>
              Building *
              <select
                value={buildingId}
                onChange={handleBuildingChange}
                required
              >
                {buildings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Floor *
              <select
                value={floorId}
                onChange={(e) => setFloorId(e.target.value)}
                required
                disabled={availableFloors.length === 0}
              >
                {availableFloors.length === 0 ? (
                  <option value="">No floors available</option>
                ) : (
                  availableFloors.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))
                )}
              </select>
            </label>
          </div>

          <div className="form-row">
            <label>
              Room / Location Name *
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. 101c, Computer Laboratory 1, Library"
              />
            </label>

            <label>
              Room Code (optional)
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. LAB-1, 101c"
              />
            </label>
          </div>

          <label>
            Description (optional)
            <textarea
              rows="2"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. North wing, near stairwell"
            />
          </label>

          <div className="form-row">
            <label>
              Display Order
              <input
                type="number"
                value={displayOrder}
                onChange={(e) => setDisplayOrder(e.target.value)}
              />
            </label>
            <label className="checkbox-label" style={{ marginTop: "24px" }}>
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              Active for new reports
            </label>
          </div>

          {error && <p className="form-error">{error}</p>}

          <div className="modal-actions">
            <button
              type="button"
              className="secondary"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button type="submit" className="primary" disabled={saving}>
              {saving ? "Saving..." : room ? "Update room" : "Create room"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MapUploadModal({ onClose, onSaved }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [activateImmediately, setActivateImmediately] = useState(true);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  function handleFileChange(e) {
    const selected = e.target.files?.[0];
    if (!selected) return;

    if (selected.size > 10 * 1024 * 1024) {
      setError("File exceeds maximum allowed size of 10 MB.");
      setFile(null);
      setPreviewUrl("");
      return;
    }

    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(selected.type)) {
      setError("Supported file formats are JPEG, PNG, or WebP.");
      setFile(null);
      setPreviewUrl("");
      return;
    }

    setError("");
    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file) {
      setError("Please select a map image file.");
      return;
    }
    if (!name.trim()) {
      setError("Map name is required.");
      return;
    }

    setUploading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("mapImage", file);
      formData.append("name", name.trim());
      formData.append("description", description.trim());
      formData.append(
        "activateImmediately",
        activateImmediately ? "true" : "false",
      );

      const response = await fetch("/api/admin/maps/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to upload map");
      }

      onSaved(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal form-modal">
        <button className="modal-close" onClick={onClose}>
          ×
        </button>
        <p className="eyebrow">CAMPUS MAP</p>
        <h3>Upload Campus Map Version</h3>
        <p className="section-subtext" style={{ marginBottom: "16px" }}>
          Accepts JPEG, PNG, and WebP images up to 10 MB. Older reports retain
          their previous map version.
        </p>

        <form onSubmit={handleSubmit} className="mgmt-form">
          <label>
            Map Version Title *
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Campus Layout 2026, Main Campus Spring"
            />
          </label>

          <label>
            Description (optional)
            <textarea
              rows="2"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Details on newly added buildings or revised boundaries"
            />
          </label>

          <label>
            Map Image File * (Max 10 MB: JPEG, PNG, WebP)
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              required
              onChange={handleFileChange}
            />
          </label>

          {previewUrl && (
            <div className="image-preview-box">
              <p className="preview-label">Client preview:</p>
              <img
                src={previewUrl}
                alt="Preview"
                className="upload-preview-img"
              />
            </div>
          )}

          <label className="checkbox-label" style={{ marginTop: "12px" }}>
            <input
              type="checkbox"
              checked={activateImmediately}
              onChange={(e) => setActivateImmediately(e.target.checked)}
            />
            Set as active campus map for new reports immediately
          </label>

          {error && <p className="form-error">{error}</p>}

          <div className="modal-actions">
            <button
              type="button"
              className="secondary"
              onClick={onClose}
              disabled={uploading}
            >
              Cancel
            </button>
            <button type="submit" className="primary" disabled={uploading}>
              {uploading ? "Uploading & validating..." : "Upload map"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ImpactConfirmModal({
  modalState,
  onCancel,
  onConfirm,
  onArchiveInstead,
}) {
  const { type, action, item, impact } = modalState;
  const isDelete = action === "delete";

  const typeName = type.charAt(0).toUpperCase() + type.slice(1);
  const canDelete = impact?.canDelete !== false;

  const childFloors = impact?.floorsCount ?? impact?.totalFloors;
  const childRooms = impact?.roomsCount ?? impact?.totalRooms;
  const reportsCount = Number(impact?.reportsCount ?? 0);

  return (
    <div className="modal-backdrop">
      <div className="modal confirm-modal">
        <button className="modal-close" onClick={onCancel}>
          ×
        </button>
        <p className="eyebrow">
          {isDelete ? "PERMANENT DELETION" : "ARCHIVE CONFIRMATION"}
        </p>
        <h3>
          {isDelete ? `Delete ${typeName}: ` : `Archive ${typeName}: `} "
          {item.name}"?
        </h3>

        {type === "map" ? (
          <div>
            {isDelete && impact?.isActive ? (
              <div className="impact-warning-box">
                <p>
                  <strong>
                    Cannot delete the currently active map version.
                  </strong>
                </p>
                <p>
                  Please activate another map version before deleting this one.
                </p>
              </div>
            ) : (
              <p>
                {isDelete
                  ? `Are you sure you want to permanently delete map "${item.name}" version ${item.version}? Reports with pins referencing this map will prevent deletion.`
                  : `Archiving will deactivate this map version. Historical reports linked to it will continue displaying properly.`}
              </p>
            )}
          </div>
        ) : (
          <div>
            {/* Location item details & impact metrics */}
            <div className="impact-stats-card">
              <p>
                <strong>Associated Dependencies:</strong>
              </p>
              <ul>
                {childFloors !== undefined && (
                  <li>
                    Child floors: <strong>{childFloors}</strong>
                    {impact?.activeFloors !== undefined &&
                      impact.activeFloors !== childFloors && (
                        <span> ({impact.activeFloors} active)</span>
                      )}
                  </li>
                )}
                {childRooms !== undefined && (
                  <li>
                    Child rooms: <strong>{childRooms}</strong>
                    {impact?.activeRooms !== undefined &&
                      impact.activeRooms !== childRooms && (
                        <span> ({impact.activeRooms} active)</span>
                      )}
                  </li>
                )}
                <li>
                  Historical reports referencing this location:{" "}
                  <strong>{reportsCount}</strong>
                </li>
              </ul>
            </div>

            {isDelete ? (
              !canDelete ? (
                <div className="impact-warning-box">
                  <p>
                    <strong>Permanent deletion is not allowed.</strong>
                  </p>
                  <p>
                    This {type} cannot be deleted because it is referenced by:
                  </p>
                  <ul
                    style={{
                      margin: "6px 0 10px 18px",
                      paddingLeft: "10px",
                    }}
                  >
                    {childFloors > 0 && (
                      <li>
                        <strong>{childFloors}</strong> child floor(s)
                      </li>
                    )}
                    {childRooms > 0 && (
                      <li>
                        <strong>{childRooms}</strong> child room(s)
                      </li>
                    )}
                    {reportsCount > 0 && (
                      <li>
                        <strong>{reportsCount}</strong> historical report(s)
                      </li>
                    )}
                  </ul>
                  <p>
                    {childRooms > 0 || childFloors > 0 ? (
                      <>
                        To permanently delete this {type}, you must first delete
                        or reassign its child{" "}
                        {childRooms > 0 && childFloors > 0
                          ? "floors and rooms"
                          : childFloors > 0
                            ? "floors"
                            : "rooms"}
                        .
                        <br />
                        Alternatively, choose <strong>
                          Archive instead
                        </strong>{" "}
                        to safely remove it from future report dropdowns while
                        preserving all history.
                      </>
                    ) : (
                      <>
                        To preserve historical reports referencing this {type},
                        choose <strong>Archive instead</strong>.
                      </>
                    )}
                  </p>
                </div>
              ) : (
                <p>
                  This {type} has no dependent records or report references. Are
                  you sure you want to permanently delete it?
                </p>
              )
            ) : (
              <div className="impact-info-box">
                <p>
                  Archiving this {type} will hide it from new report dropdown
                  choices.
                </p>
                <p>
                  <strong>Note:</strong> Any child floors and rooms will no
                  longer be selectable under this parent. Existing historical
                  reports will preserve their saved location details.
                </p>
              </div>
            )}
          </div>
        )}

        <div className="modal-actions" style={{ marginTop: "24px" }}>
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
          {isDelete && !canDelete && (
            <button
              type="button"
              className="primary"
              onClick={onArchiveInstead}
            >
              Archive instead
            </button>
          )}
          {(!isDelete || canDelete) && (
            <button
              type="button"
              className={isDelete ? "danger" : "primary"}
              onClick={onConfirm}
            >
              {isDelete ? "Permanently delete" : "Confirm archive"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
