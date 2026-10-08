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
  const match = base64Data.match(/^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/i);
  if (!match) {
    throw new Error(
      "Unsupported image format. Allowed formats: JPEG, PNG, WebP.",
    );
  }
  const ext =
    match[1].toLowerCase() === "jpeg" ? "jpg" : match[1].toLowerCase();
  const buffer = Buffer.from(match[2], "base64");
  const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
  if (buffer.length > MAX_SIZE) {
    throw new Error("File exceeds the maximum allowed size of 10 MB.");
  }
  if (buffer.length === 0) {
    throw new Error("Uploaded file is empty.");
  }

  // Magic byte checks
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47;
  const isWebp =
    buffer.length >= 12 &&
    buffer.slice(0, 4).toString() === "RIFF" &&
    buffer.slice(8, 12).toString() === "WEBP";

  if (!isJpeg && !isPng && !isWebp) {
    throw new Error("Invalid image file contents. Header check failed.");
  }

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const filename = `${namePrefix}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${ext}`;
  const fullPath = path.join(targetDir, filename);
  fs.writeFileSync(fullPath, buffer);

  return {
    filename,
    relativePath: `/uploads/maps/${filename}`,
    fileSize: buffer.length,
    mimeType: `image/${match[1].toLowerCase() === "jpg" ? "jpeg" : match[1].toLowerCase()}`,
  };
}
