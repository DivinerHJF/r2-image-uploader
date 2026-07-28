import { LARGE_IMAGE_PIXELS } from "./config.js";
import { calculateSize } from "./utils.js";

function canvasContext(canvas, message) {
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error(message);
  return context;
}

export function canvasToWebPBlob(canvas, fileName, preset) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error(`压缩失败：${fileName}`));
      },
      "image/webp",
      preset.quality,
    );
  });
}

function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      resolve({
        drawable: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        cleanup() {
          image.removeAttribute("src");
          URL.revokeObjectURL(url);
        },
      });
    };
    image.onerror = () => {
      image.removeAttribute("src");
      URL.revokeObjectURL(url);
      reject(new Error(`无法读取图片：${file.name}`));
    };
    image.src = url;
  });
}

async function loadDrawable(file) {
  if ("createImageBitmap" in window) {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        drawable: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup() { bitmap.close(); },
      };
    } catch {
      // Some formats are accepted by <img> but not createImageBitmap.
    }
  }
  return loadImageElement(file);
}

export async function processOriginalFile(file, preset, { onLargeImage } = {}) {
  const source = await loadDrawable(file);
  let canvas;
  try {
    if (source.width * source.height >= LARGE_IMAGE_PIXELS) onLargeImage?.();
    const target = calculateSize(source.width, source.height, preset);
    canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const context = canvasContext(canvas, "当前浏览器不支持 Canvas 图片处理。");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(source.drawable, 0, 0, target.width, target.height);
    const blob = await canvasToWebPBlob(canvas, file.name, preset);
    return { blob, dimensions: `${target.width}×${target.height}`, preset };
  } finally {
    source.cleanup();
    if (canvas) {
      canvas.width = 1;
      canvas.height = 1;
    }
  }
}

export async function processCroppedCanvas(canvas, fileName, preset) {
  try {
    const blob = await canvasToWebPBlob(canvas, fileName, preset);
    return { blob, dimensions: `${canvas.width}×${canvas.height}`, preset };
  } finally {
    canvas.width = 1;
    canvas.height = 1;
  }
}
