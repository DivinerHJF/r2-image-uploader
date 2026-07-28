import { CATEGORIES, IMAGE_EXTENSION_PATTERN } from "./config.js";

export function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "image";
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function getDateParts(date = new Date()) {
  return {
    year: String(date.getFullYear()),
    month: String(date.getMonth() + 1).padStart(2, "0"),
  };
}

export function getTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

export function buildKey({ category, baseSlug, originalName, index, mode, date = new Date() }) {
  const safeCategory = CATEGORIES.has(category) ? category : "misc";
  const sequence = String(index).padStart(2, "0");
  const { year, month } = getDateParts(date);
  const timestamp = getTimestamp(date);
  const originalSlug = slugify(originalName);

  switch (mode) {
    case "category-sequence":
      return `${safeCategory}/${baseSlug}-${sequence}.webp`;
    case "date-category-sequence":
      return `${year}/${month}/${safeCategory}/${baseSlug}-${sequence}.webp`;
    case "category-timestamp":
      return `${safeCategory}/${year}/${month}/${baseSlug}-${timestamp}-${sequence}.webp`;
    case "category-original":
      return `${safeCategory}/${year}/${month}/${originalSlug}-${sequence}.webp`;
    case "category-date-sequence":
    default:
      return `${safeCategory}/${year}/${month}/${baseSlug}-${sequence}.webp`;
  }
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatSaving(originalBytes, compressedBytes) {
  if (!originalBytes) return "-";
  const delta = originalBytes - compressedBytes;
  const percent = Math.abs((delta / originalBytes) * 100).toFixed(1);
  return delta >= 0 ? `节省 ${percent}%` : `增加 ${percent}%`;
}

export function calculateSize(width, height, preset) {
  const ratio = Math.min(preset.maxWidth / width, preset.maxHeight / height, 1);
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

export function buildAltText(baseAlt, baseSlug, index, total) {
  const fallback = baseAlt || baseSlug;
  return total > 1 ? `${fallback} ${String(index).padStart(2, "0")}` : fallback;
}

export function buildFormats({ alt, url }) {
  const safeAlt = escapeHtml(alt);
  return {
    markdown: `![${alt}](${url})`,
    html: `<img src="${url}" alt="${safeAlt}" loading="lazy">`,
    hugo: `{{< figure src="${url}" alt="${safeAlt}" >}}`,
  };
}

export function isImageFile(file) {
  return Boolean(file && (file.type.startsWith("image/") || IMAGE_EXTENSION_PATTERN.test(file.name)));
}

export function fileFingerprint(file) {
  return [file.name, file.size, file.lastModified, file.type].join(":");
}

export function createId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `image-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const area = document.createElement("textarea");
  area.value = value;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  const copied = document.execCommand("copy");
  area.remove();
  if (!copied) throw new Error("浏览器未允许复制，请手动复制。");
}

export function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export function icon(name) {
  const paths = {
    grip: '<circle cx="8" cy="6" r="1"/><circle cx="16" cy="6" r="1"/><circle cx="8" cy="12" r="1"/><circle cx="16" cy="12" r="1"/><circle cx="8" cy="18" r="1"/><circle cx="16" cy="18" r="1"/>',
    up: '<path d="m6 15 6-6 6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5"/>',
    check: '<path d="m6 12 4 4 8-8"/>',
  };
  return `<svg aria-hidden="true" viewBox="0 0 24 24">${paths[name] || ""}</svg>`;
}

export function trapFocus(event, container) {
  if (event.key !== "Tab") return;
  const focusable = Array.from(
    container.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'),
  ).filter((element) => !element.hidden && element.offsetParent !== null);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
