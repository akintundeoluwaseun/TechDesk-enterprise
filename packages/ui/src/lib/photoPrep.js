// Gets a photo of a notebook page ready to send: turned the right way up and
// shrunk to a JPEG of about half a megabyte. Phone cameras take 4-12 MB
// pictures; handwriting reads just as well at 2000 pixels on the long side,
// and the smaller file sends quickly on a weak connection.
export const MAX_SIDE = 2000;
const RAW_OK = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const MAX_RAW_BYTES = 5_000_000;

async function decode(file) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Older browsers don't take the options; some can't decode at all.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function draw(src, maxSide) {
  const w = src.width || src.naturalWidth;
  const h = src.height || src.naturalHeight;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; // a transparent PNG would otherwise turn black
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] || "");
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/**
 * {image (base64), mime, preview (small data URL for the chat)}. Throws
 * "not_image" when the file can't be used.
 */
export async function preparePhoto(file, { maxSide = MAX_SIDE, quality = 0.82 } = {}) {
  if (!file || !/^image\//.test(file.type || "image/")) throw new Error("not_image");
  let src;
  try {
    src = await decode(file);
  } catch {
    // HEIC from an iPhone opens in Safari only. Gemini reads it as it is.
    if (RAW_OK.has(file.type) && file.size <= MAX_RAW_BYTES) {
      return { image: await fileToBase64(file), mime: file.type, preview: null };
    }
    throw new Error("not_image");
  }
  const big = draw(src, maxSide);
  const image = big.toDataURL("image/jpeg", quality).split(",")[1];
  const preview = draw(src, 360).toDataURL("image/jpeg", 0.7);
  src.close?.();
  return { image, mime: "image/jpeg", preview };
}
