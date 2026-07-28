import { cropEditor, CropCancelledError } from "./crop-editor.js";
import { initializeFiles, renderFiles } from "./files.js";
import { processOriginalFile } from "./image-processing.js";
import { initializeResults, renderResults, scrollToResults, setStatus, showResults } from "./results.js";
import { getUploadSettings, initializeSettings, openSettings, updatePathPreview } from "./settings.js";
import { appState, getCounts, releasePreview, resetItemForRetry, revokeAllPreviews } from "./state.js";
import { uploadOne } from "./upload.js";
import { buildAltText, buildFormats, buildKey } from "./utils.js";

const controls = {
  upload: document.querySelector("#upload-button"),
  direct: document.querySelector("#direct-upload-button"),
  mobileUpload: document.querySelector("#mobile-upload"),
  mobileDirect: document.querySelector("#mobile-direct-upload"),
  cancel: document.querySelector("#cancel-upload"),
  mobileCancel: document.querySelector("#mobile-cancel-upload"),
  mobileStatus: document.querySelector("#mobile-upload-status"),
  toast: document.querySelector("#toast"),
};

let toastTimer = null;

function notify(message, type = "") {
  if (!message) return;
  controls.toast.textContent = message;
  controls.toast.dataset.type = type;
  controls.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    controls.toast.hidden = true;
  }, 2600);
}

function renderAll() {
  renderFiles();
  updatePathPreview(appState.items);
  renderResults();
}

function setUploadingControls(isUploading) {
  controls.cancel.hidden = !isUploading;
  controls.mobileCancel.hidden = !isUploading;
  controls.mobileUpload.hidden = isUploading;
  controls.mobileDirect.hidden = isUploading;
  controls.mobileStatus.textContent = isUploading ? "上传队列进行中" : "等待上传";
}

function createUploadSpec(item, settings, mode, index, total) {
  const alt = buildAltText(settings.baseAlt, settings.baseSlug, index, total);
  return {
    mode,
    alt,
    desiredKey: buildKey({
      category: settings.category,
      baseSlug: settings.baseSlug,
      originalName: item.file.name,
      index,
      mode: settings.namingMode,
    }),
    preset: { ...settings.preset },
    presetId: settings.presetId,
    conflictPolicy: settings.conflictPolicy,
  };
}

function safeErrorMessage(error, token) {
  let message = error instanceof Error ? error.message : "上传失败，请稍后重试。";
  if (token) message = message.split(token).join("[已隐藏]");
  return message.slice(0, 300);
}

async function processItem(item, position, total, token) {
  const spec = item.uploadSpec;
  item.alt = item.alt || spec.alt;

  if (!item.processing) {
    if (spec.mode === "edit") {
      item.status = "editing";
      setStatus(`正在编辑 ${position} / ${total}：${item.file.name}`);
      renderAll();
      const edited = await cropEditor.open({
        item,
        index: position,
        total,
        initialAlt: item.alt,
        preset: spec.preset,
        onProcessing() {
          item.status = "processing";
          setStatus(`正在压缩 ${position} / ${total}：${item.file.name}`);
          renderAll();
        },
      });
      item.alt = edited.alt;
      if (edited.kind === "processed") {
        item.processing = edited.processed;
      } else {
        item.status = "processing";
        setStatus(`正在优化 ${position} / ${total}：${item.file.name}`);
        renderAll();
        item.processing = await processOriginalFile(item.file, spec.preset, {
          onLargeImage() { notify("正在优化大尺寸图片，处理时间可能稍长。", ""); },
        });
      }
    } else {
      item.status = "processing";
      setStatus(`正在压缩 ${position} / ${total}：${item.file.name}`);
      renderAll();
      item.processing = await processOriginalFile(item.file, spec.preset, {
        onLargeImage() { notify("正在优化大尺寸图片，处理时间可能稍长。", ""); },
      });
    }
  }

  item.status = "uploading";
  setStatus(`正在上传 ${position} / ${total}：${item.file.name}`);
  renderAll();
  const controller = new AbortController();
  appState.activeController = controller;
  const response = await uploadOne({
    file: item.file,
    blob: item.processing.blob,
    key: spec.desiredKey,
    token,
    conflictPolicy: spec.conflictPolicy,
    signal: controller.signal,
  });

  item.result = {
    key: response.key,
    url: response.url,
    renamed: Boolean(response.renamed),
    alt: item.alt,
    originalSize: item.file.size,
    compressedSize: item.processing.blob.size,
    dimensions: item.processing.dimensions,
    preset: item.processing.preset,
  };
  item.result.formats = buildFormats(item.result);
  item.status = "success";
  item.error = "";
  item.processing = null;
  releasePreview(item);
  appState.activeController = null;
}

function markUnstartedCancelled(queue, startIndex) {
  for (const item of queue.slice(startIndex)) {
    if (item.status === "success" || item.status === "error") continue;
    item.status = "cancelled";
    item.error = "未开始上传，已取消。";
  }
}

async function handleUpload({ mode = "edit", itemIds = null } = {}) {
  if (appState.isUploading) return;
  const candidates = appState.items.filter((item) => {
    if (itemIds) return itemIds.includes(item.id) && item.status !== "success";
    return item.status !== "success";
  });
  if (!candidates.length) {
    notify("没有需要上传的图片。", "");
    return;
  }

  const settings = getUploadSettings(appState.items);
  if (!settings.token) {
    openSettings("请先填写上传 Token，再开始上传。");
    return;
  }
  if (settings.conflictPolicy === "overwrite") {
    const confirmed = window.confirm("你选择了覆盖同名文件。已有 R2 对象可能被替换，确定继续吗？");
    if (!confirmed) return;
  }

  candidates.forEach((item) => {
    const globalIndex = appState.items.indexOf(item) + 1;
    if (!item.uploadSpec) item.uploadSpec = createUploadSpec(item, settings, mode, globalIndex, appState.items.length);
    if (item.status === "error" || item.status === "cancelled") resetItemForRetry(item);
  });

  appState.isUploading = true;
  appState.cancelRequested = false;
  appState.lastUploadMode = mode;
  appState.uploadStarted = true;
  setUploadingControls(true);
  showResults();
  setStatus(`准备处理 ${candidates.length} 张图片…`);
  renderAll();

  for (let queueIndex = 0; queueIndex < candidates.length; queueIndex += 1) {
    const item = candidates[queueIndex];
    if (appState.cancelRequested) {
      markUnstartedCancelled(candidates, queueIndex);
      break;
    }

    try {
      const globalPosition = appState.items.indexOf(item) + 1;
      await processItem(item, globalPosition, appState.items.length, settings.token);
    } catch (error) {
      appState.activeController = null;
      if (error instanceof CropCancelledError) {
        item.status = "cancelled";
        item.error = "已取消当前批次。";
        appState.cancelRequested = true;
        markUnstartedCancelled(candidates, queueIndex + 1);
        notify("已取消当前上传批次；成功项会保留。", "");
        break;
      }
      if (error instanceof DOMException && error.name === "AbortError") {
        item.status = "cancelled";
        item.error = "上传请求已取消，可稍后重新上传。";
        markUnstartedCancelled(candidates, queueIndex + 1);
        break;
      }
      item.status = "error";
      item.error = safeErrorMessage(error, settings.token);
      setStatus(`${item.file.name} 上传失败，继续处理后续图片。`, "error");
      renderAll();
    }
    renderAll();
  }

  appState.isUploading = false;
  appState.activeController = null;
  setUploadingControls(false);
  const counts = getCounts();
  const summary = `上传完成：成功 ${counts.success} 张，失败 ${counts.error} 张，取消 ${counts.cancelled} 张。`;
  setStatus(summary, counts.error ? "error" : counts.success ? "success" : "");
  renderAll();
  notify(summary, counts.error ? "error" : "success");
  scrollToResults();
}

function retryOne(id) {
  const item = appState.items.find((candidate) => candidate.id === id);
  if (!item || !["error", "cancelled"].includes(item.status)) return;
  handleUpload({ mode: item.uploadSpec?.mode || appState.lastUploadMode, itemIds: [id] });
}

function retryFailed() {
  const failed = appState.items.filter((item) => item.status === "error").map((item) => item.id);
  if (failed.length) handleUpload({ mode: appState.lastUploadMode, itemIds: failed });
}

function cancelUpload() {
  if (!appState.isUploading) return;
  appState.cancelRequested = true;
  appState.activeController?.abort();
  setStatus("正在取消当前请求和剩余任务…");
  notify("正在取消剩余上传任务。", "");
}

initializeSettings({ onChange: renderAll });
initializeFiles({ onChange: renderAll, onRetry: retryOne, onNotify: notify });
initializeResults({ onRetryFailed: retryFailed, onNotify: notify });

controls.upload.addEventListener("click", () => handleUpload({ mode: "edit" }));
controls.direct.addEventListener("click", () => handleUpload({ mode: "direct" }));
controls.mobileUpload.addEventListener("click", () => handleUpload({ mode: "edit" }));
controls.mobileDirect.addEventListener("click", () => handleUpload({ mode: "direct" }));
controls.cancel.addEventListener("click", cancelUpload);
controls.mobileCancel.addEventListener("click", cancelUpload);

window.addEventListener("pagehide", revokeAllPreviews);

setUploadingControls(false);
renderAll();
