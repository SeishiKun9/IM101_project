// ==============================================================================
// Client-side Image Compression & Optimization Utility
// Downscales high-resolution camera photos and compresses them into web-friendly JPEGs
// ==============================================================================

/**
 * Validates whether an image file is of a supported format.
 * @param {File} file
 * @returns {boolean}
 */
export function isSupportedImageFile(file) {
  if (!file || !file.type) return false;
  const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  return validTypes.includes(file.type.toLowerCase());
}

/**
 * Compresses an image File or Blob via an off-screen HTML5 Canvas.
 *
 * @param {File|Blob} file - The uploaded image file from an <input type="file">
 * @param {Object} options - Compression configuration
 * @param {number} options.maxDimension - Max width or height in pixels (default: 1280)
 * @param {number} options.quality - JPEG compression quality 0.1 - 1.0 (default: 0.78)
 * @returns {Promise<{ dataUrl: string, originalSize: number, compressedSize: number, compressionRatio: string }>}
 */
export function compressImageFile(file, options = {}) {
  const { maxDimension = 1280, quality = 0.78 } = options;

  return new Promise((resolve, reject) => {
    if (!file) {
      return reject(new Error("No image file provided."));
    }
    if (!isSupportedImageFile(file)) {
      return reject(new Error("Please upload a valid image file (JPEG, PNG, or WebP)."));
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read image file from disk."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not decode image content."));
      img.onload = () => {
        let { width, height } = img;
        const originalSize = file.size || Math.round((reader.result.length * 3) / 4);

        // Calculate proportional scale factor
        const maxCurrent = Math.max(width, height);
        if (maxCurrent > maxDimension) {
          const scale = maxDimension / maxCurrent;
          width = Math.max(1, Math.round(width * scale));
          height = Math.max(1, Math.round(height * scale));
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          // Fallback to original data URL if canvas 2D context is unavailable
          return resolve({
            dataUrl: reader.result,
            originalSize,
            compressedSize: originalSize,
            compressionRatio: "1.00x",
          });
        }

        // Apply smooth downsampling
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, width, height);

        const compressedDataUrl = canvas.toDataURL("image/jpeg", quality);
        const compressedSize = Math.round((compressedDataUrl.length * 3) / 4);
        const ratio = (originalSize / Math.max(1, compressedSize)).toFixed(1);

        resolve({
          dataUrl: compressedDataUrl,
          originalSize,
          compressedSize,
          compressionRatio: `${ratio}x`,
        });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
