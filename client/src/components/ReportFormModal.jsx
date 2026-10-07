import React, { useState } from "react";
import { apiRequest } from "../api/client.js";
import { campusLocations } from "../constants/locations.js";

export default function ReportFormModal({ onClose, onSaved }) {
  const [error, setError] = useState("");
  const [pin, setPin] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [building, setBuilding] = useState("Scanlon");
  const [floor, setFloor] = useState("Ground floor");
  const [reportType, setReportType] = useState("lost");
  const [submitting, setSubmitting] = useState(false);

  const floorOptions = Object.keys(campusLocations[building] || {});
  const roomOptions = campusLocations[building]?.[floor] || [];

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
      if (reportType === "found" && !pin) {
        throw new Error(
          "Found reports require a map pin for the found location.",
        );
      }
      const image = await readImage(formData.get("image"));
      await apiRequest("/items", {
        method: "POST",
        body: JSON.stringify({
          ...data,
          itemType: data.type,
          dateReported: data.date,
          building: data.building,
          room: data.room,
          location: data.room || data.building,
          contactPhone: data.contact,
          isAnonymous: Boolean(formData.get("isAnonymous")),
          hidePhone: Boolean(formData.get("hidePhone")),
          mapX: pin?.x || "",
          mapY: pin?.y || "",
          image,
        }),
      });

      form.reset();
      setBuilding("Scanlon");
      setFloor("Ground floor");
      setReportType("lost");
      setPin(null);
      setImagePreview("");
      onSaved();
    } catch (requestError) {
      setError(requestError.message);
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
            <input name="title" required />
          </label>

          <label>
            Category
            <input
              name="category"
              placeholder="e.g. Electronics, ID, clothing"
              required
            />
          </label>

          {reportType === "found" && (
            <label>
              Finder's name
              <input name="reporterName" required />
            </label>
          )}

          <div className="form-row">
            <label>
              Building / area
              <select
                name="building"
                value={building}
                onChange={(event) => {
                  const nextBuilding = event.target.value;
                  const nextFloor = Object.keys(
                    campusLocations[nextBuilding],
                  )[0];
                  setBuilding(nextBuilding);
                  setFloor(nextFloor);
                }}
              >
                {Object.keys(campusLocations).map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Floor
              <select
                name="floor"
                value={floor}
                onChange={(event) => setFloor(event.target.value)}
              >
                {floorOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label>
            Room / specific area
            <select name="room" required>
              {roomOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <div className="map-picker">
            <div className="map-picker-heading">
              <strong>Pinpoint the campus location</strong>
              <span>
                {pin
                  ? `Pinned at ${pin.x}%, ${pin.y}%`
                  : "Click the map to place a pin"}
              </span>
            </div>
            <div
              className="campus-map"
              onClick={handleMapClick}
              role="application"
              aria-label="Campus map. Click to place a location pin"
            >
              <img
                className="map-image"
                src="/assets/images/campus-map.jpg"
                alt="Campus map"
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
          </div>

          <label>
            Contact number
            <input
              name="contact"
              type="tel"
              required={reportType === "found"}
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
            <textarea name="description" rows={4} required />
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
