import React, { useEffect, useRef, useState } from "react";
import { apiRequest } from "../api/client.js";

export default function ReportFormModal({
  onClose,
  onSaved,
  initialType = "lost",
}) {
  const [error, setError] = useState("");
  const [pin, setPin] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [reportType, setReportType] = useState(initialType || "lost");
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef(null);

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

  function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (file) {
      setImagePreview(URL.createObjectURL(file));
    }
  }

  function handleRemovePhoto() {
    setImagePreview("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
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
          "Found reports require a map pin pinpointing where the item was found.",
        );
      }
      if (!selectedBuildingId) {
        throw new Error("Please select a building or campus area.");
      }

      const file = fileInputRef.current?.files?.[0];
      const image = file ? await readImage(file) : "";

      await apiRequest("/items", {
        method: "POST",
        body: JSON.stringify({
          ...data,
          itemType: reportType,
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
      setPin(null);
      setImagePreview("");
      onSaved();
    } catch (requestError) {
      setError(requestError.message);
      fetchLocations();
      fetchActiveMap();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-modal-title"
    >
      <section className="modal report-modal">
        <button
          className="modal-close"
          onClick={onClose}
          type="button"
          aria-label="Close report dialog"
        >
          ×
        </button>

        <div className="modal-header-tag">CAMPUS PROPERTY REGISTRY</div>
        <h2 id="report-modal-title" className="report-modal-title">
          {reportType === "lost"
            ? "File a Lost Item Report"
            : "Report a Found Item"}
        </h2>
        <p className="modal-intro">
          Please fill in as much accurate information as possible to help
          verifiers and classmates identify the item.
        </p>

        {/* Report Type Selector Pills */}
        <div className="report-type-toggle">
          <button
            type="button"
            className={`type-toggle-btn ${reportType === "lost" ? "active lost" : ""}`}
            onClick={() => setReportType("lost")}
          >
            <span className="toggle-dot" />I Lost Something
          </button>
          <button
            type="button"
            className={`type-toggle-btn ${reportType === "found" ? "active found" : ""}`}
            onClick={() => setReportType("found")}
          >
            <span className="toggle-dot" />I Found Something
          </button>
        </div>

        {error && (
          <div className="alert-banner alert-danger">
            <strong>Please check:</strong> {error}
          </div>
        )}

        <form className="report-form" onSubmit={submit}>
          <input type="hidden" name="type" value={reportType} />

          {/* SECTION 1: ITEM DETAILS */}
          <fieldset className="form-section">
            <legend className="form-section-title">1. Item Information</legend>

            <div className="form-row">
              <div className="form-group flex-2">
                <label htmlFor="title-input">
                  Item Title / Name <span className="req">*</span>
                </label>
                <input
                  id="title-input"
                  name="title"
                  required
                  placeholder="e.g. Black Lenovo Laptop, Stainless Water Bottle"
                />
                <span className="field-hint">
                  A concise name clearly identifying the object.
                </span>
              </div>

              <div className="form-group flex-1">
                <label htmlFor="category-input">
                  Category <span className="req">*</span>
                </label>
                <input
                  id="category-input"
                  name="category"
                  required
                  placeholder="e.g. Electronics, ID, Keys"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="date-input">
                  {reportType === "lost" ? "Date Lost" : "Date Found"}{" "}
                  <span className="req">*</span>
                </label>
                <input
                  id="date-input"
                  name="date"
                  type="date"
                  required
                  defaultValue={new Date().toISOString().split("T")[0]}
                />
              </div>

              {reportType === "found" && (
                <div className="form-group">
                  <label htmlFor="finder-input">
                    Finder&rsquo;s Full Name <span className="req">*</span>
                  </label>
                  <input
                    id="finder-input"
                    name="reporterName"
                    required
                    placeholder="Full name of finder"
                  />
                </div>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="desc-input">
                Detailed Description <span className="req">*</span>
              </label>
              <textarea
                id="desc-input"
                name="description"
                rows={3}
                required
                placeholder="Include color, brand, stickers, scratches, case color, or unique identifying traits..."
              />
            </div>
          </fieldset>

          {/* SECTION 2: LOCATION */}
          <fieldset className="form-section">
            <legend className="form-section-title">2. Campus Location</legend>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="building-select">
                  Building / Campus Area <span className="req">*</span>
                </label>
                <select
                  id="building-select"
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
              </div>

              <div className="form-group">
                <label htmlFor="floor-select">
                  Floor <span className="opt">(optional)</span>
                </label>
                <select
                  id="floor-select"
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
                      <option value="">Select floor...</option>
                      {availableFloors.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </>
                  )}
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="room-select">
                  Room / Lab <span className="opt">(optional)</span>
                </label>
                <select
                  id="room-select"
                  name="roomId"
                  value={selectedRoomId}
                  disabled={!selectedFloorId || availableRooms.length === 0}
                  onChange={(event) => setSelectedRoomId(event.target.value)}
                >
                  {!selectedFloorId ? (
                    <option value="">Select floor first</option>
                  ) : availableRooms.length === 0 ? (
                    <option value="">No rooms on this floor</option>
                  ) : (
                    <>
                      <option value="">Select room...</option>
                      {availableRooms.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} {r.code ? `(${r.code})` : ""}
                        </option>
                      ))}
                    </>
                  )}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="locdesc-input">
                  Specific Landmark / Hallway{" "}
                  <span className="opt">(optional)</span>
                </label>
                <input
                  id="locdesc-input"
                  type="text"
                  value={locationDescription}
                  onChange={(e) => setLocationDescription(e.target.value)}
                  placeholder="e.g. Near West stairs, Bench outside Lab 3"
                />
              </div>
            </div>

            {/* Campus Map Pinpoint */}
            <div className="map-pinpoint-container">
              <div className="map-picker-heading">
                <strong>
                  Campus Map Pinpoint{" "}
                  {reportType === "found" && <span className="req">*</span>}
                </strong>
                <span className="map-pin-status">
                  {activeMap
                    ? pin
                      ? `Pinned at ${pin.x}%, ${pin.y}%`
                      : "Click the map to place a precise pin"
                    : "Campus map unavailable"}
                </span>
              </div>

              {loadingMap ? (
                <div className="map-loading-box">Loading campus map...</div>
              ) : activeMap ? (
                <div
                  className="campus-map"
                  onClick={handleMapClick}
                  role="application"
                  aria-label={`Campus map: ${activeMap.name}. Click to pin location`}
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
                      title={`Pinned location (${pin.x}%, ${pin.y}%)`}
                    >
                      ●
                    </span>
                  )}
                </div>
              ) : (
                <div className="no-map-card">
                  <p>No active campus map loaded in system.</p>
                </div>
              )}
            </div>
          </fieldset>

          {/* SECTION 3: CONTACT & PHOTO */}
          <fieldset className="form-section">
            <legend className="form-section-title">
              3. Contact &amp; Photo
            </legend>

            <div className="form-group">
              <label htmlFor="contact-input">
                Contact Phone Number{" "}
                {reportType === "found" ? (
                  <span className="req">*</span>
                ) : (
                  <span className="opt">(optional)</span>
                )}
              </label>
              <input
                id="contact-input"
                name="contact"
                type="tel"
                required={reportType === "found"}
                placeholder="e.g. 09123456789"
              />
              <span className="field-hint">
                Used by verifiers to contact you regarding item handover.
              </span>
            </div>

            {/* Photo Upload Area with Preview, Replace, and Remove Controls */}
            <div className="form-group">
              <label>
                Item Photo{" "}
                {reportType === "found" ? (
                  <span className="req">*</span>
                ) : (
                  <span className="opt">(optional)</span>
                )}
              </label>

              <input
                ref={fileInputRef}
                name="image"
                type="file"
                accept="image/*"
                required={reportType === "found" && !imagePreview}
                onChange={handleFileChange}
                style={{ display: "none" }}
              />

              {!imagePreview ? (
                <div
                  className="photo-upload-dropzone"
                  onClick={() => fileInputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      fileInputRef.current?.click();
                    }
                  }}
                >
                  <svg
                    className="upload-icon"
                    width="36"
                    height="36"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  <span className="upload-title">Click to upload photo</span>
                  <span className="upload-subtitle">PNG, JPG up to 10MB</span>
                </div>
              ) : (
                <div className="photo-preview-controls-box">
                  <img
                    className="photo-uploaded-preview"
                    src={imagePreview}
                    alt="Selected item preview"
                  />
                  <div className="photo-controls-row">
                    <button
                      className="btn btn-secondary btn-sm"
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Replace photo
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      type="button"
                      onClick={handleRemovePhoto}
                    >
                      Remove photo
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Privacy Checkboxes */}
            <div className="privacy-checkboxes-group">
              <label className="checkbox-control">
                <input name="isAnonymous" type="checkbox" />
                <span>Remain anonymous on public dashboard</span>
              </label>

              <label className="checkbox-control">
                <input name="hidePhone" type="checkbox" defaultChecked />
                <span>Hide my phone number from general student view</span>
              </label>
            </div>
          </fieldset>

          <div className="modal-actions-bar">
            <button
              className="btn btn-primary btn-lg full"
              disabled={submitting}
              type="submit"
            >
              {submitting
                ? "Submitting Report..."
                : "Submit Report to Campus Registry"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
