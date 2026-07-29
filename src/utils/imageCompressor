/**
 * High-performance Image Compression Utility for DoBill POS.
 * Automatically downscales and compresses high-resolution / huge images (e.g. 1MB - 1GB+)
 * into ultra-lightweight WebP / JPEG base64 strings (typically 10 KB - 50 KB)
 * before saving to Firestore / local database.
 */

export interface ImageCompressOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0.1 to 1.0
  format?: 'image/webp' | 'image/jpeg';
  maxSizeBytes?: number; // Target max size in bytes (e.g., 100 * 1024 = 100KB)
}

const DEFAULT_OPTIONS: ImageCompressOptions = {
  maxWidth: 500,
  maxHeight: 500,
  quality: 0.75,
  format: 'image/webp',
  maxSizeBytes: 100 * 1024, // 100 KB max limit
};

/**
 * Compress an uploaded File object (Image) to an ultra-small base64 string.
 */
export async function compressImageFile(
  file: File,
  options: ImageCompressOptions = {}
): Promise<string> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      const src = event.target?.result as string;
      if (!src) {
        return reject(new Error('Failed to read image file'));
      }

      compressBase64Image(src, opts)
        .then(resolve)
        .catch(reject);
    };

    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

/**
 * Compress an existing Data URL / base64 image string to an ultra-small base64 string.
 */
export async function compressBase64Image(
  dataUrl: string,
  options: ImageCompressOptions = {}
): Promise<string> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // If already non-image or tiny string, return as is
  if (!dataUrl || !dataUrl.startsWith('data:image/')) {
    return dataUrl;
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        let width = img.width;
        let height = img.height;
        const maxW = opts.maxWidth || 500;
        const maxH = opts.maxHeight || 500;

        // Calculate aspect ratio scaling
        if (width > maxW || height > maxH) {
          if (width / height > maxW / maxH) {
            height = Math.round((height * maxW) / width);
            width = maxW;
          } else {
            width = Math.round((width * maxH) / height);
            height = maxH;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return resolve(dataUrl); // Fallback if canvas context fails
        }

        // Configure smoothing for high visual clarity despite small dimensions
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Draw resized image
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Attempt WebP export first, fallback to JPEG if WebP unsupported
        let format = opts.format || 'image/webp';
        let quality = opts.quality || 0.75;
        let result = canvas.toDataURL(format, quality);

        // Fallback check: if WebP not supported, toDataURL falls back or returns png
        if (format === 'image/webp' && !result.startsWith('data:image/webp')) {
          format = 'image/jpeg';
          result = canvas.toDataURL(format, quality);
        }

        // Iterative quality reduction if result exceeds target size limit (e.g., 100KB)
        const targetMaxSizeBytes = opts.maxSizeBytes || 100 * 1024;
        let attempts = 0;
        while (result.length * 0.75 > targetMaxSizeBytes && quality > 0.2 && attempts < 5) {
          quality -= 0.15;
          attempts++;
          result = canvas.toDataURL(format, quality);
        }

        console.log(
          `[ImageCompressor] Compressed from ~${Math.round(dataUrl.length * 0.75 / 1024)} KB ` +
          `down to ~${Math.round(result.length * 0.75 / 1024)} KB (${width}x${height}px)`
        );

        resolve(result);
      } catch (err) {
        console.warn('[ImageCompressor] Canvas compression failed, returning original:', err);
        resolve(dataUrl);
      }
    };

    img.onerror = (err) => {
      console.warn('[ImageCompressor] Image load failed for compression:', err);
      resolve(dataUrl); // Return original on error
    };

    img.src = dataUrl;
  });
}
