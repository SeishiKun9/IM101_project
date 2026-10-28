import React, { useEffect, useRef, useState } from "react";
import { apiRequest } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { compressImageFile } from "../utils/imageCompressor.js";

export default function ReportFormModal({
  onClose,
  onSaved,
  initialType = "lost",
  onViewItem,
}) {
  const { user } = useAuth();
  const [error, setError] = useState("");
  const [pin, setPin] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [reportType, setReportType] = useState(initialType || "lost");
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef(null);

  // Task 18: Live duplicate detection state
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [duplicateWarning, setDuplicateWarning] = useState(null);
  const [dismissedDuplicateId, setDismissedDuplicateId] = useState(null);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const [allowDuplicateSubmit, setAllowDuplicateSubmit] = useState(false);

  // User prefill & privacy preferences (defaults from profile)
  const [reporterName, setReporterName] = useState(user?.name || "");
  const [contactPhone, setContactPhone] = useState(user?.contactNumber || "");
  const [isAnonymous, setIsAnonymous] = useState(Boolean(user?.defaultAnonymous));
  const [hidePhone, setHidePhone] = useState(
    user?.defaultHidePhone !== undefined ? Boolean(user.defaultHidePhone) : true,
  );
  const hasUserEditedRef = useRef(false);

  useEffect(() => {
    if (user && !hasUserEditedRef.current) {
      if (!reporterName && user.name) setReporterName(user.name);
      if (!contactPhone && user.contactNumber) setContactPhone(user.contactNumber);
      if (user.defaultAnonymous !== undefined) setIsAnonymous(Boolean(user.defaultAnonymous));
      if (user.defaultHidePhone !== undefined) setHidePhone(Boolean(user.defaultHidePhone));
    }
  }, [user]);

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

  // Task 18: Debounced duplicate detection query
  useEffect(() => {
    if (!user || !title.trim() || title.trim().length < 3) {
      setDuplicateWarning(null);
      return;
    }

    let isMounted = true;
    const timer = setTimeout(async () => {
      setCheckingDuplicate(true);
      try {
        const query = new URLSearchParams({
          title: title.trim(),
          category: category.trim(),
          type: reportType,
          buildingId: selectedBuildingId || "",
        });
        const res = await apiRequest(`/reports/check-duplicate?${query.toString()}`);
        if (isMounted) {
          if (res?.hasDuplicate && res.duplicate && res.duplicate.id !== dismissedDuplicateId) {
            setDuplicateWarning(res.duplicate);
          } else {
            setDuplicateWarning(null);
          }
        }
      } catch {
        // Ignore preflight errors
      } finally {
        if (isMounted) setCheckingDuplicate(false);
      }
    }, 380);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [title, category, reportType, selectedBuildingId, user, dismissedDuplicateId]);

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

  async function readImage(file) {
    if (!file || !file.size) return "";
    const result = await compressImageFile(file, {
      maxDimension: 1280,
      quality: 0.78,
    });
    return result.dataUrl;
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

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (file) {
      try {
        setError("");
        const compressed = await compressImageFile(file, {
          maxDimension: 1280,
          quality: 0.78,
        });
        setImagePreview(compressed.dataUrl);
      } catch (err) {
        setError(err.message || "Failed to process photo.");
      }
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
      // Task 18: Confirm duplicate submit if active duplicate is unaddressed
      if (duplicateWarning && dismissedDuplicateId !== duplicateWarning.id && !allowDuplicateSubmit) {
        const proceed = window.confirm(
          `Possible duplicate detected:\n\nYou already have an active ${duplicateWarning.status} report for "${duplicateWarning.title}".\n\nDo you want to file a new report anyway?`,
        );
        if (!proceed) {
          setSubmitting(false);
          return;
        }
        setAllowDuplicateSubmit(true);
      }

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
          title: title.trim(),
          category: category.trim(),
          allowDuplicate: Boolean(allowDuplicateSubmit || dismissedDuplicateId === duplicateWarning?.id),
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
          reporterName: reporterName.trim() || undefined,
          contactPhone: contactPhone.trim() || null,
          isAnonymous: Boolean(isAnonymous),
          hidePhone: Boolean(hidePhone),
          mapId: pin && activeMap ? activeMap.id : null,
          mapX: pin?.x || null,
          mapY: pin?.y || null,
          image,
        }),
      });

      form.reset();
      setTitle("");
      setCategory("");
      setDuplicateWarning(null);
      setDismissedDuplicateId(null);
      setAllowDuplicateSubmit(false);
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

        {/* Task 18: Live Duplicate Warning Card */}
        {duplicateWarning && dismissedDuplicateId !== duplicateWarning.id && (
          <div className="duplicate-warning-banner" role="alert">
            <div className="duplicate-warning-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <div className="duplicate-warning-body">
              <div className="duplicate-warning-title">
                <span>Possible Duplicate Report Detected</span>
                <span className="duplicate-confidence-tag">
                  {duplicateWarning.score}% similarity
                </span>
              </div>
              <p className="duplicate-warning-text">
                You already have an open{" "}
                <strong>{duplicateWarning.status === "under_review" ? "Under Review" : "Reported"}</strong>{" "}
                {reportType} report for{" "}
                <strong>"{duplicateWarning.title}"</strong> ({duplicateWarning.category || "General"}, reported on {duplicateWarning.dateReported}).
              </p>
              <div className="duplicate-warning-actions">
                {onViewItem && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      onClose();
                      onViewItem(duplicateWarning.id);
                    }}
                  >
                    🔍 View My Existing Report
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setDismissedDuplicateId(duplicateWarning.id);
                    setAllowDuplicateSubmit(true);
                  }}
                >
                  Dismiss &amp; Continue Submitting
                </button>
              </div>
            </div>
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
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    if (dismissedDuplicateId) setDismissedDuplicateId(null);
                  }}
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
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value);
                    if (dismissedDuplicateId) setDismissedDuplicateId(null);
                  }}
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

              <div className="form-group">
                <label htmlFor="reporter-input">
                  {reportType === "found" ? "Finder's Full Name" : "Reporter's Full Name"}{" "}
                  {reportType === "found" ? (
                    <span className="req">*</span>
                  ) : (
                    <span className="opt">(prefilled)</span>
                  )}
                </label>
                <input
                  id="reporter-input"
                  name="reporterName"
                  value={reporterName}
                  required={reportType === "found"}
                  onChange={(e) => {
                    hasUserEditedRef.current = true;
                    setReporterName(e.target.value);
                  }}
                  placeholder="Full name"
                />
              </div>
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
                value={contactPhone}
                onChange={(e) => {
                  hasUserEditedRef.current = true;
                  setContactPhone(e.target.value);
                }}
                required={reportType === "found"}
                placeholder="e.g. 09123456789 or +639123456789"
              />
              <span className="field-hint">
                {user?.contactNumber
                  ? "Prefilled from your saved profile contact."
                  : reportType === "found"
                    ? "Required for found items so campus verifiers can coordinate handover."
                    : "Used by verifiers to contact you regarding item recovery."}
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
                <input
                  name="isAnonymous"
                  type="checkbox"
                  checked={isAnonymous}
                  onChange={(e) => {
                    hasUserEditedRef.current = true;
                    setIsAnonymous(e.target.checked);
                  }}
                />
                <span>Remain anonymous on public dashboard (hide my name)</span>
              </label>

              <label className="checkbox-control">
                <input
                  name="hidePhone"
                  type="checkbox"
                  checked={hidePhone}
                  onChange={(e) => {
                    hasUserEditedRef.current = true;
                    setHidePhone(e.target.checked);
                  }}
                />
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
