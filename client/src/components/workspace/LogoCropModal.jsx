import React, { useEffect, useRef, useState, useCallback } from "react";

/**
 * Interactive Modal for editing, zooming, rotating, and cropping school logos.
 * Renders the cropped result onto a high-resolution 512x512 Canvas and returns a Data URL.
 */
export default function LogoCropModal({ imageSrc, onConfirm, onClose }) {
  const containerRef = useRef(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [naturalDimensions, setNaturalDimensions] = useState({ width: 0, height: 0 });
  const [scale, setScale] = useState(1);
  const [minScale, setMinScale] = useState(0.5);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0); // 0, 90, 180, 270
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [cropShape, setCropShape] = useState("circle"); // "circle" | "square"

  const CROP_BOX_SIZE = 300; // px in modal view
  const OUTPUT_SIZE = 512; // px exported resolution

  const imgRef = useRef(null);

  // Initialize and load image
  useEffect(() => {
    if (!imageSrc) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      setNaturalDimensions({ width: img.naturalWidth, height: img.naturalHeight });
      // Calculate initial scale to fit the crop box
      const fitScale = Math.max(
        CROP_BOX_SIZE / img.naturalWidth,
        CROP_BOX_SIZE / img.naturalHeight
      );
      setScale(fitScale);
      setMinScale(fitScale * 0.5);
      setPosition({ x: 0, y: 0 });
      setRotation(0);
      setImageLoaded(true);
    };
    img.src = imageSrc;
    imgRef.current = img;
  }, [imageSrc]);

  // Handle Dragging / Panning
  function handleMouseDown(e) {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  }

  function handleMouseMove(e) {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  }

  function handleMouseUp() {
    setIsDragging(false);
  }

  // Touch support for mobile/touch screens
  function handleTouchStart(e) {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      setIsDragging(true);
      setDragStart({ x: touch.clientX - position.x, y: touch.clientY - position.y });
    }
  }

  function handleTouchMove(e) {
    if (!isDragging || e.touches.length !== 1) return;
    const touch = e.touches[0];
    setPosition({
      x: touch.clientX - dragStart.x,
      y: touch.clientY - dragStart.y,
    });
  }

  function handleTouchEnd() {
    setIsDragging(false);
  }

  // Handle Mouse Wheel Zoom
  function handleWheel(e) {
    e.preventDefault();
    const zoomStep = 0.08;
    const newScale = e.deltaY < 0 ? scale + zoomStep : scale - zoomStep;
    setScale(Math.max(minScale, Math.min(newScale, 4)));
  }

  // Reset positioning to center
  function handleReset() {
    if (!naturalDimensions.width) return;
    const fitScale = Math.max(
      CROP_BOX_SIZE / naturalDimensions.width,
      CROP_BOX_SIZE / naturalDimensions.height
    );
    setScale(fitScale);
    setPosition({ x: 0, y: 0 });
    setRotation(0);
  }

  function handleRotate(delta) {
    setRotation((prev) => (prev + delta + 360) % 360);
  }

  // Export cropped image via Canvas when "Okay" is clicked
  const handleConfirm = useCallback(() => {
    if (!imgRef.current) return;

    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext("2d");

    if (!ctx) return;

    ctx.clearRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    // Factor from display size to exported canvas size
    const factor = OUTPUT_SIZE / CROP_BOX_SIZE;

    // Apply translations
    ctx.save();
    ctx.translate(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(position.x * factor, position.y * factor);

    const drawW = naturalDimensions.width * scale * factor;
    const drawH = naturalDimensions.height * scale * factor;

    ctx.drawImage(
      imgRef.current,
      -drawW / 2,
      -drawH / 2,
      drawW,
      drawH
    );
    ctx.restore();

    // Export as high quality PNG Data URL
    const croppedDataUrl = canvas.toDataURL("image/png");
    onConfirm(croppedDataUrl);
  }, [rotation, position, scale, naturalDimensions, onConfirm]);

  // Keyboard shortcut: Escape to close, Enter to confirm
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "Enter" && !e.shiftKey) {
        handleConfirm();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, handleConfirm]);

  return (
    <div
      className="modal-backdrop modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="logo-crop-title"
      onClick={onClose}
      style={{ zIndex: 1200 }}
    >
      <div
        className="modal logo-crop-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "520px",
          width: "95vw",
          borderRadius: "var(--radius-lg, 14px)",
          background: "var(--surface, #ffffff)",
          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.25)",
          overflow: "hidden",
        }}
      >
        {/* Modal Header */}
        <div
          className="modal-header"
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <h2 id="logo-crop-title" style={{ margin: 0, fontSize: "17px", fontWeight: 700, color: "var(--text-main)" }}>
              ✏️ Crop &amp; Adjust School Logo
            </h2>
            <p style={{ margin: "3px 0 0", fontSize: "12px", color: "var(--text-muted)" }}>
              Drag to reposition, zoom or rotate to frame your campus emblem.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-xs"
            onClick={onClose}
            aria-label="Close"
            style={{ fontSize: "16px", padding: "4px 8px", lineHeight: 1 }}
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px", alignItems: "center" }}>
          {/* Interactive Crop Viewport */}
          <div
            ref={containerRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onWheel={handleWheel}
            style={{
              width: `${CROP_BOX_SIZE}px`,
              height: `${CROP_BOX_SIZE}px`,
              position: "relative",
              overflow: "hidden",
              borderRadius: "var(--radius-md, 8px)",
              background: "#1e293b",
              cursor: isDragging ? "grabbing" : "grab",
              userSelect: "none",
              touchAction: "none",
              boxShadow: "inset 0 0 0 1px rgba(255, 255, 255, 0.1)",
            }}
          >
            {/* The Image Layer */}
            {imageLoaded && (
              <img
                src={imageSrc}
                alt="Logo to crop"
                draggable={false}
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  width: `${naturalDimensions.width * scale}px`,
                  height: `${naturalDimensions.height * scale}px`,
                  transform: `translate(-50%, -50%) translate(${position.x}px, ${position.y}px) rotate(${rotation}deg)`,
                  transformOrigin: "center center",
                  pointerEvents: "none",
                  maxWidth: "none",
                }}
              />
            )}

            {/* Guide Mask Overlay (dimmed edges + clear center) */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
                border: "2px solid rgba(255, 255, 255, 0.8)",
                borderRadius: cropShape === "circle" ? "50%" : "6px",
                boxShadow: cropShape === "circle"
                  ? "0 0 0 9999px rgba(15, 23, 42, 0.65)"
                  : "0 0 0 9999px rgba(15, 23, 42, 0.55)",
              }}
            />

            {/* Crosshair / Grid Overlay */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gridTemplateRows: "1fr 1fr 1fr",
                opacity: 0.25,
              }}
            >
              <div style={{ borderRight: "1px dashed #fff", borderBottom: "1px dashed #fff" }} />
              <div style={{ borderRight: "1px dashed #fff", borderBottom: "1px dashed #fff" }} />
              <div style={{ borderBottom: "1px dashed #fff" }} />
              <div style={{ borderRight: "1px dashed #fff", borderBottom: "1px dashed #fff" }} />
              <div style={{ borderRight: "1px dashed #fff", borderBottom: "1px dashed #fff" }} />
              <div style={{ borderBottom: "1px dashed #fff" }} />
              <div style={{ borderRight: "1px dashed #fff" }} />
              <div style={{ borderRight: "1px dashed #fff" }} />
              <div />
            </div>

            {/* Instruction tooltip badge */}
            <div
              style={{
                position: "absolute",
                bottom: "8px",
                left: "50%",
                transform: "translateX(-50%)",
                background: "rgba(0, 0, 0, 0.65)",
                color: "#f8fafc",
                fontSize: "11px",
                padding: "3px 8px",
                borderRadius: "12px",
                pointerEvents: "none",
                whiteSpace: "nowrap",
              }}
            >
              🖐️ Drag to position • Scroll to zoom
            </div>
          </div>

          {/* Controls Bar: Zoom Slider */}
          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-main)" }}>
                🔍 Zoom Level:
              </span>
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                {Math.round((scale / (minScale * 2 || 1)) * 100)}%
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                onClick={() => setScale((s) => Math.max(minScale, s - 0.1))}
                title="Zoom Out"
              >
                ➖
              </button>
              <input
                type="range"
                min={minScale}
                max={minScale * 4}
                step={(minScale * 3) / 100}
                value={scale}
                onChange={(e) => setScale(parseFloat(e.target.value))}
                style={{ flex: 1, cursor: "pointer" }}
              />
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                onClick={() => setScale((s) => Math.min(minScale * 4, s + 0.1))}
                title="Zoom In"
              >
                ➕
              </button>
            </div>
          </div>

          {/* Toolbar: Rotation, Frame Shape, Reset */}
          <div
            style={{
              width: "100%",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "8px",
              paddingTop: "6px",
              borderTop: "1px solid var(--border)",
            }}
          >
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                onClick={() => handleRotate(-90)}
                title="Rotate 90° counter-clockwise"
              >
                ↺ 90°
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                onClick={() => handleRotate(90)}
                title="Rotate 90° clockwise"
              >
                ↻ 90°
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                onClick={handleReset}
                title="Reset zoom and positioning"
              >
                🔄 Reset
              </button>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <span style={{ fontSize: "11px", color: "var(--text-muted)", marginRight: "2px" }}>Guide:</span>
              <button
                type="button"
                className={`btn btn-xs ${cropShape === "circle" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setCropShape("circle")}
                style={{ padding: "3px 8px", fontSize: "11px" }}
              >
                ⭕ Circle
              </button>
              <button
                type="button"
                className={`btn btn-xs ${cropShape === "square" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setCropShape("square")}
                style={{ padding: "3px 8px", fontSize: "11px" }}
              >
                ⬛ Square
              </button>
            </div>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div
          className="modal-footer"
          style={{
            padding: "14px 20px",
            borderTop: "1px solid var(--border)",
            background: "var(--surface-alt, #f8fafc)",
            display: "flex",
            justifyContent: "flex-end",
            gap: "10px",
          }}
        >
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleConfirm}
            style={{ fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            ✓ Okay
          </button>
        </div>
      </div>
    </div>
  );
}
