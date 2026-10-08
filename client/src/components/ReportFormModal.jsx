import React, { useEffect, useState } from "react";
import { apiRequest } from "../api/client.js";

export default function ReportFormModal({ onClose, onSaved }) {
  const [error, setError] = useState("");
  const [pin, setPin] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [reportType, setReportType] = useState("lost");
  const [submitting, setSubmitting] = useState(false);

  // Dynamic location states
  const [locations, setLocations] = useState([]);
  const [selectedBuildingId, setSelectedBuildingId] = useState("");
  const [selectedFloorId, setSelectedFloorId] = useState("");
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [locationDescription, setLocationDescription] = useState("");

  // Map state
  const [activeMap, setActiveMap] = useState(null);
  const [loadingMap, setLoadingMap] = useState(true);

  async function fetchLocations() {
    try {
      const data = await apiRequest("/locations");
      setLocations(data);
    } catch (err) {
      setError(`Failed to load locations: ${err.message}`);
    }
  }

  async function fetchActiveMap() {
    try {
      setLoadingMap(true);
      const map = await apiRequest("/maps/active");
      setActiveMap(map);
    } catch {
      setActiveMap(null);
    } finally {
      setLoadingMap(false);
    }
  }

  useEffect(() => {
    fetchLocations();
    fetchActiveMap();
  }, []);

  const currentBuilding = locations.find(
    (b) => String(b.id) === String(selectedBuildingId),
  );
  const availableFloors = currentBuilding?.floors || [];

  const currentFloor = availableFloors.find(
    (f) => String(f.id) === String(selectedFloorId),
  );
  const availableRooms = currentFloor?.rooms || [];

  const currentRoom = availableRooms.find(
    (r) => String(r.id) === String(selectedRoomId),
  );

  function readImage(file) {
    if (!file || !file.size) return Promise.resolve("");
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const image = new Image();
        image.onerror = reject;
        image.onload = () => {
          const scale = Math.min(1, 1280 / Math.max(image.width, image.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));
          canvas
            .getContext("2d")
            .drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.76));
        };
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function handleMapClick(event) {
    if (!activeMap) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.max(
      2,
      Math.min(98, ((event.clientX - bounds.left) / bounds.width) * 100),
    );
    const y = Math.max(
      2,
      Math.min(98, ((event.clientY - bounds.top) / bounds.height) * 100),
    );
    setPin({ x: x.toFixed(2), y: y.toFixed(2) });
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    const form = event.currentTarget;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);

    try {
      if (reportType === "found" && activeMap && !pin) {
        throw new Error(
          "Found reports require a map pin for the found location.",
        );
      }
      if (!selectedBuildingId) {
        throw new Error("Please select a building or campus area.");
      }

      const image = await readImage(formData.get("image"));

      await apiRequest("/items", {
        method: "POST",
        body: JSON.stringify({
          ...data,
          itemType: data.type,
          dateReported: data.date,
          buildingId: selectedBuildingId
            ? parseInt(selectedBuildingId, 10)
            : null,
          floorId: selectedFloorId ? parseInt(selectedFloorId, 10) : null,
          roomId: selectedRoomId ? parseInt(selectedRoomId, 10) : null,
          locationDescription: locationDescription.trim(),
          building: currentBuilding?.name || "",
          floor: currentFloor?.name || "",
          room: currentRoom?.name || "",
          location:
            currentRoom?.name ||
            currentFloor?.name ||
            currentBuilding?.name ||
            "Campus",
          contactPhone: data.contact,
          isAnonymous: Boolean(formData.get("isAnonymous")),
          hidePhone: Boolean(formData.get("hidePhone")),
          mapId: pin && activeMap ? activeMap.id : null,
          mapX: pin?.x || null,
          mapY: pin?.y || null,
          image,
        }),
      });

      form.reset();
      setSelectedBuildingId("");
      setSelectedFloorId("");
      setSelectedRoomId("");
      setLocationDescription("");
      setReportType("lost");
      setPin(null);
      setImagePreview("");
      onSaved();
    } catch (requestError) {
      setError(requestError.message);
      // If error might be due to outdated location options, refresh options without wiping form
      fetchLocations();
      fetchActiveMap();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <section className="modal report-modal">
        <button className="modal-close" onClick={onClose}>
          ×
        </button>
        <p className="eyebrow">NEW RECORD</p>
        <h2>Report an item</h2>

        <form className="report-form" onSubmit={submit}>
          <div className="form-row">
            <label>
              Report type
              <select
                name="type"
                value={reportType}
                onChange={(event) => setReportType(event.target.value)}
              >
                <option value="lost">I lost something</option>
                <option value="found">I found something</option>
              </select>
            </label>
            <label>
              Date reported
              <input name="date" type="date" required />
            </label>
          </div>

          <label>
            Item title
            <input
              name="title"
              required
              placeholder="e.g. Black Lenovo ThinkPad, Water Bottle"
            />
          </label>

          <label>
            Category
            <input
              name="category"
              placeholder="e.g. Electronics, ID, clothing, keys"
              required
            />
          </label>

          {reportType === "found" && (
            <label>
              Finder's name
              <input
                name="reporterName"
                required
                placeholder="Full name of finder"
              />
            </label>
          )}

          {/* DYNAMIC DEPENDENT LOCATION SELECTORS */}
          <div className="form-row">
            <label>
              Building / Campus Area *
              <select
                name="buildingId"
                value={selectedBuildingId}
                required
                onChange={(event) => {
                  setSelectedBuildingId(event.target.value);
                  setSelectedFloorId("");
                  setSelectedRoomId("");
                }}
              >
                <option value="">Select a building / area...</option>
                {locations.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Floor (optional)
              <select
                name="floorId"
                value={selectedFloorId}
                disabled={!selectedBuildingId || availableFloors.length === 0}
                onChange={(event) => {
                  setSelectedFloorId(event.target.value);
                  setSelectedRoomId("");
                }}
              >
                {!selectedBuildingId ? (
                  <option value="">Select building first</option>
                ) : availableFloors.length === 0 ? (
                  <option value="">No floors registered</option>
                ) : (
                  <>
                    <option value="">Select floor (optional)</option>
                    {availableFloors.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </>
                )}
              </select>
            </label>
          </div>

          <div className="form-row">
            <label>
              Room / Laboratory (optional)
              <select
                name="roomId"
                value={selectedRoomId}
                disabled={!selectedFloorId || availableRooms.length === 0}
                onChange={(event) => setSelectedRoomId(event.target.value)}
              >
                {!selectedFloorId ? (
                  <option value="">Select floor first</option>
                ) : availableRooms.length === 0 ? (
                  <option value="">No rooms on this floor (optional)</option>
                ) : (
                  <>
                    <option value="">Select room (optional)</option>
                    {availableRooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} {r.code ? `(${r.code})` : ""}
                      </option>
                    ))}
                  </>
                )}
              </select>
            </label>

            <label>
              Specific Location Details (optional)
              <input
                type="text"
                value={locationDescription}
                onChange={(e) => setLocationDescription(e.target.value)}
                placeholder="e.g. Near hallway stairs, Bench outside room"
              />
            </label>
          </div>

          {/* CAMPUS MAP PINPOINT */}
          <div className="map-picker">
            <div className="map-picker-heading">
              <strong>Pinpoint the campus location</strong>
              <span>
                {activeMap
                  ? pin
                    ? `Pinned at ${pin.x}%, ${pin.y}%`
                    : "Click the map to place a pin"
                  : "Map currently unavailable"}
              </span>
            </div>

            {loadingMap ? (
              <div className="map-loading-box">Loading campus map...</div>
            ) : activeMap ? (
              <div
                className="campus-map"
                onClick={handleMapClick}
                role="application"
                aria-label={`Campus map: ${activeMap.name}. Click to place a location pin`}
              >
                <img
                  className="map-image"
                  src={activeMap.imageUrl}
                  alt={activeMap.name || "Campus map"}
                />
                {pin && (
                  <span
                    className="map-pin"
                    style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
                  >
                    ●
                  </span>
                )}
              </div>
            ) : (
              <div className="no-map-card">
                <p>
                  <strong>No campus map is currently available.</strong>
                </p>
                <p>
                  You can still submit your report using the location selectors
                  and description above.
                </p>
              </div>
            )}
          </div>

          <label>
            Contact number
            <input
              name="contact"
              type="tel"
              required={reportType === "found"}
              placeholder="e.g. 09123456789"
            />
          </label>

          <label>
            Item photo
            <input
              name="image"
              type="file"
              accept="image/*"
              required={reportType === "found"}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) setImagePreview(URL.createObjectURL(file));
              }}
            />
            {imagePreview && (
              <img
                className="report-image-preview"
                src={imagePreview}
                alt="Selected item"
              />
            )}
          </label>

          <label className="privacy-checkbox">
            <input name="isAnonymous" type="checkbox" />
            Remain anonymous on the public dashboard
          </label>

          <label className="privacy-checkbox">
            <input name="hidePhone" type="checkbox" defaultChecked />
            Hide my phone number from other users
          </label>

          <label>
            Description
            <textarea
              name="description"
              rows={4}
              required
              placeholder="Detailed description of the item"
            />
          </label>

          {error && <p className="form-error">{error}</p>}

          <button className="primary full" disabled={submitting}>
            {submitting ? "Submitting report..." : "Submit report"}
          </button>
        </form>
      </section>
    </div>
  );
}
