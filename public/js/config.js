export const CATEGORIES = new Set(["blog", "travel", "books", "tailor", "misc"]);

export const COMPRESSION_PRESETS = {
  balanced: { label: "均衡", maxWidth: 1600, maxHeight: 1600, quality: 0.82 },
  small: { label: "轻量", maxWidth: 1200, maxHeight: 1200, quality: 0.72 },
  large: { label: "高清", maxWidth: 2200, maxHeight: 2200, quality: 0.9 },
  original: { label: "仅转 WebP", maxWidth: Infinity, maxHeight: Infinity, quality: 0.86 },
};

export const ASPECT_RATIOS = {
  free: NaN,
  original: null,
  "1:1": 1,
  "4:3": 4 / 3,
  "3:2": 3 / 2,
  "16:9": 16 / 9,
  "9:16": 9 / 16,
};

export const STATUS_LABELS = {
  pending: "等待处理",
  editing: "正在编辑",
  processing: "正在压缩",
  uploading: "正在上传",
  success: "上传成功",
  error: "上传失败",
  cancelled: "已取消",
};

export const STORAGE_KEYS = {
  token: "r2-uploader-session-token",
  preferences: "r2-uploader-preferences-v2",
};

export const LARGE_FILE_BYTES = 14 * 1024 * 1024;
export const LARGE_IMAGE_PIXELS = 24_000_000;

export const IMAGE_EXTENSION_PATTERN = /\.(avif|bmp|gif|heic|heif|jpe?g|png|svg|webp)$/i;
