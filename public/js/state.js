import { createId, fileFingerprint, isImageFile } from "./utils.js";

export const appState = {
  items: [],
  isUploading: false,
  cancelRequested: false,
  activeController: null,
  lastUploadMode: "edit",
  uploadStarted: false,
};

function makeItem(file) {
  return {
    id: createId(),
    fingerprint: fileFingerprint(file),
    file,
    previewUrl: URL.createObjectURL(file),
    status: "pending",
    error: "",
    alt: "",
    desiredKey: "",
    processing: null,
    result: null,
  };
}

export function addFiles(files) {
  const existing = new Set(appState.items.map((item) => item.fingerprint));
  const added = [];
  let invalidCount = 0;
  let duplicateCount = 0;

  for (const file of Array.from(files || [])) {
    if (!isImageFile(file)) {
      invalidCount += 1;
      continue;
    }
    const fingerprint = fileFingerprint(file);
    if (existing.has(fingerprint)) {
      duplicateCount += 1;
      continue;
    }
    existing.add(fingerprint);
    const item = makeItem(file);
    appState.items.push(item);
    added.push(item);
  }

  return { added, invalidCount, duplicateCount };
}

export function releasePreview(item) {
  if (!item?.previewUrl) return;
  URL.revokeObjectURL(item.previewUrl);
  item.previewUrl = "";
}

export function removeItem(id) {
  const index = appState.items.findIndex((item) => item.id === id);
  if (index < 0) return false;
  releasePreview(appState.items[index]);
  appState.items[index].processing = null;
  appState.items.splice(index, 1);
  return true;
}

export function clearItems() {
  for (const item of appState.items) releasePreview(item);
  appState.items.length = 0;
}

export function moveItem(id, direction) {
  const from = appState.items.findIndex((item) => item.id === id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= appState.items.length) return false;
  const [item] = appState.items.splice(from, 1);
  appState.items.splice(to, 0, item);
  return true;
}

export function moveItemTo(id, targetId) {
  const from = appState.items.findIndex((item) => item.id === id);
  const to = appState.items.findIndex((item) => item.id === targetId);
  if (from < 0 || to < 0 || from === to) return false;
  const [item] = appState.items.splice(from, 1);
  appState.items.splice(to, 0, item);
  return true;
}

export function resetItemForRetry(item) {
  item.status = "pending";
  item.error = "";
  item.result = null;
}

export function getCounts() {
  return appState.items.reduce(
    (counts, item) => {
      counts.total += 1;
      counts[item.status] = (counts[item.status] || 0) + 1;
      return counts;
    },
    { total: 0, pending: 0, editing: 0, processing: 0, uploading: 0, success: 0, error: 0, cancelled: 0 },
  );
}

export function totalOriginalBytes() {
  return appState.items.reduce((sum, item) => sum + item.file.size, 0);
}

export function revokeAllPreviews() {
  for (const item of appState.items) releasePreview(item);
}
