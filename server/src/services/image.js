import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export function validateAndSaveImage(
  base64Data,
  targetDir,
  namePrefix = "map",
) {
  if (!base64Data || typeof base64Data !== "string") {
    throw new Error("No image data provided.");
  }

  let rawBase64 = base64Data.trim();
  const commaIndex = rawBase64.indexOf(",");
  if (commaIndex !== -1 && rawBase64.startsWith("data:")) {
    rawBase64 = rawBase64.slice(commaIndex + 1);
  }

  // Strip all whitespace/newlines that might occur in base64 strings
  rawBase64 = rawBase64.replace(/\s+/g, "");

  const buffer = Buffer.from(rawBase64, "base64");
  const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
  if (buffer.length > MAX_SIZE) {
    throw new Error("File exceeds the maximum allowed size of 10 MB.");
  }
  if (buffer.length === 0) {
    throw new Error("Uploaded file is empty.");
  }

  // Magic byte checks
  const isJpeg =
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff;
  const isPng =
    buffer.length >= 4 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47;
  const isWebp =
    buffer.length >= 12 &&
    buffer.slice(0, 4).toString() === "RIFF" &&
    buffer.slice(8, 12).toString() === "WEBP";

  const isSvg =
    buffer.slice(0, 256).toString("utf8").toLowerCase().includes("<svg") ||
    buffer.slice(0, 256).toString("utf8").toLowerCase().includes("<?xml");

  if (!isJpeg && !isPng && !isWebp && !isSvg) {
    throw new Error(
      "Invalid image file contents. Header check failed. Only JPEG, PNG, WebP, and SVG images are supported.",
    );
  }

  const ext = isJpeg ? "jpg" : isPng ? "png" : isWebp ? "webp" : "svg";
  const mimeType = isJpeg
    ? "image/jpeg"
    : isPng
      ? "image/png"
      : isWebp
        ? "image/webp"
        : "image/svg+xml";

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const filename = `${namePrefix}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${ext}`;
  const fullPath = path.join(targetDir, filename);
  fs.writeFileSync(fullPath, buffer);

  const subfolder = path.basename(targetDir) || "maps";

  return {
    filename,
    relativePath: `/uploads/${subfolder}/${filename}`,
    fileSize: buffer.length,
    mimeType,
  };
}
