const CATEGORIES = new Set(["blog", "travel", "books", "misc"]);
const COMPRESSION_PRESETS = {
  balanced: { label: "均衡", maxWidth: 1600, maxHeight: 1600, quality: 0.82 },
  small: { label: "轻量", maxWidth: 1200, maxHeight: 1200, quality: 0.72 },
  large: { label: "高清", maxWidth: 2200, maxHeight: 2200, quality: 0.9 },
  original: { label: "仅转 WebP", maxWidth: Infinity, maxHeight: Infinity, quality: 0.86 },
};
const ASPECT_RATIOS = {
  free: NaN,
  original: null,
  "1:1": 1,
  "4:3": 4 / 3,
  "3:2": 3 / 2,
  "16:9": 16 / 9,
  "9:16": 9 / 16,
};

const tokenInput = document.querySelector("#token");
const categorySelect = document.querySelector("#category");
const slugInput = document.querySelector("#slug");
const altTextInput = document.querySelector("#alt-text");
const compressionPresetSelect = document.querySelector("#compression-preset");
const namingModeSelect = document.querySelector("#naming-mode");
const dropZone = document.querySelector("#drop-zone");
const fileInput = document.querySelector("#file-input");
const fileList = document.querySelector("#file-list");
const uploadButton = document.querySelector("#upload-button");
const statusBox = document.querySelector("#status");
const resultsBox = document.querySelector("#results");
const copyMarkdownButton = document.querySelector("#copy-markdown");
const copyFormatSelect = document.querySelector("#copy-format");
const copySelectedFormatButton = document.querySelector("#copy-selected-format");
const cropModal = document.querySelector("#crop-modal");
const cropImage = document.querySelector("#crop-image");
const cropRatioSelect = document.querySelector("#crop-ratio");
const cropFilename = document.querySelector("#crop-filename");
const cropProgress = document.querySelector("#crop-progress");
const confirmCropButton = document.querySelector("#confirm-crop");
const skipCropButton = document.querySelector("#skip-crop");
const cancelCropButton = document.querySelector("#cancel-crop");
const cancelCropSecondaryButton = document.querySelector("#cancel-crop-button");

let selectedFiles = [];
let formatLinks = [];
let cropper = null;
let isUploading = false;
let draggedFileIndex = null;

class UploadCancelledError extends Error {
  constructor() {
    super("已取消上传。");
    this.name = "UploadCancelledError";
  }
}

function setStatus(message, type = "") {
  statusBox.textContent = message;
  statusBox.className = `status ${type}`.trim();
}

function slugify(value) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "image";
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getDateParts(date = new Date()) {
  return {
    year: String(date.getFullYear()),
    month: String(date.getMonth() + 1).padStart(2, "0"),
  };
}

function getTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function buildKey({ category, baseSlug, originalName, index, mode }) {
  const safeCategory = CATEGORIES.has(category) ? category : "misc";
  const sequence = String(index).padStart(2, "0");
  const { year, month } = getDateParts();
  const timestamp = getTimestamp();
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

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatSaving(originalBytes, compressedBytes) {
  if (!originalBytes) return "-";
  const delta = originalBytes - compressedBytes;
  const percent = Math.abs((delta / originalBytes) * 100).toFixed(1);
  if (delta >= 0) return `减少 ${formatBytes(delta)}（${percent}%）`;
  return `增加 ${formatBytes(Math.abs(delta))}（${percent}%）`;
}

function moveSelectedFile(fromIndex, toIndex) {
  if (toIndex < 0 || toIndex >= selectedFiles.length || fromIndex === toIndex) return;
  const [file] = selectedFiles.splice(fromIndex, 1);
  selectedFiles.splice(toIndex, 0, file);
  renderFileList();
}

function renderFileList() {
  fileList.innerHTML = "";
  uploadButton.disabled = selectedFiles.length === 0 || isUploading;

  selectedFiles.forEach((file, index) => {
    const item = document.createElement("div");
    item.className = "file-item";
    item.draggable = !isUploading;
    item.dataset.index = String(index);

    const handle = document.createElement("span");
    handle.className = "drag-handle";
    handle.textContent = "☰";
    handle.title = "拖拽排序";

    const details = document.createElement("div");
    details.className = "file-details";

    const name = document.createElement("span");
    name.textContent = `${String(index + 1).padStart(2, "0")}. ${file.name}`;

    const size = document.createElement("small");
    size.textContent = formatBytes(file.size);
    details.append(name, size);

    const actions = document.createElement("div");
    actions.className = "file-actions";

    const upButton = document.createElement("button");
    upButton.className = "tiny-button";
    upButton.type = "button";
    upButton.textContent = "↑";
    upButton.disabled = index === 0 || isUploading;
    upButton.addEventListener("click", () => moveSelectedFile(index, index - 1));

    const downButton = document.createElement("button");
    downButton.className = "tiny-button";
    downButton.type = "button";
    downButton.textContent = "↓";
    downButton.disabled = index === selectedFiles.length - 1 || isUploading;
    downButton.addEventListener("click", () => moveSelectedFile(index, index + 1));

    actions.append(upButton, downButton);
    item.append(handle, details, actions);
    fileList.appendChild(item);
  });
}

function selectFiles(files) {
  selectedFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));
  renderFileList();

  if (!selectedFiles.length) {
    setStatus("请选择图片文件。", "error");
    return;
  }

  // 选择或拖入图片后只进入待上传列表，确保用户可以先排序；
  // 裁剪、压缩和上传只能由“裁剪并上传”按钮显式触发。
  setStatus(`已选择 ${selectedFiles.length} 张图片。请先拖拽排序，确认顺序后再点击“裁剪并上传”。`);
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`无法读取图片：${file.name}`));
    };

    image.src = url;
  });
}

function getCompressionPreset() {
  return COMPRESSION_PRESETS[compressionPresetSelect.value] || COMPRESSION_PRESETS.balanced;
}

function calculateSize(width, height, preset) {
  const ratio = Math.min(preset.maxWidth / width, preset.maxHeight / height, 1);
  return {
    width: Math.round(width * ratio),
    height: Math.round(height * ratio),
  };
}

function canvasFromImage(image) {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("当前浏览器不支持 Canvas 处理。请更换浏览器后重试。");
  }

  context.drawImage(image, 0, 0);
  return canvas;
}

function resizeCanvas(sourceCanvas, preset) {
  const { width, height } = calculateSize(sourceCanvas.width, sourceCanvas.height, preset);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("当前浏览器不支持 Canvas 压缩。请更换浏览器后重试。");
  }

  context.drawImage(sourceCanvas, 0, 0, width, height);
  return canvas;
}

function canvasToWebPBlob(canvas, fileName, preset) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error(`压缩失败：${fileName}`));
          return;
        }
        resolve(blob);
      },
      "image/webp",
      preset.quality,
    );
  });
}

async function compressCanvasToWebP(sourceCanvas, fileName) {
  const preset = getCompressionPreset();
  const resizedCanvas = resizeCanvas(sourceCanvas, preset);
  const blob = await canvasToWebPBlob(resizedCanvas, fileName, preset);
  return {
    blob,
    dimensions: `${resizedCanvas.width}×${resizedCanvas.height}`,
    preset,
  };
}

async function originalCanvasFromFile(file) {
  const image = await loadImage(file);
  return canvasFromImage(image);
}

function getSelectedAspectRatio(originalRatio) {
  const selected = ASPECT_RATIOS[cropRatioSelect.value];
  return selected === null ? originalRatio : selected;
}

function setModalOpen(isOpen) {
  cropModal.hidden = !isOpen;
  document.body.classList.toggle("modal-open", isOpen);
}

function destroyCropper() {
  if (cropper) {
    cropper.destroy();
    cropper = null;
  }
}

function openCropDialog(file, index, total) {
  const Cropper = window.Cropper;
  if (!Cropper) {
    throw new Error("裁剪组件加载失败，请刷新页面后重试。");
  }

  return new Promise((resolve, reject) => {
    const imageUrl = URL.createObjectURL(file);
    let isActive = true;

    const cleanup = () => {
      isActive = false;
      confirmCropButton.removeEventListener("click", handleConfirm);
      skipCropButton.removeEventListener("click", handleSkip);
      cancelCropButton.removeEventListener("click", handleCancel);
      cancelCropSecondaryButton.removeEventListener("click", handleCancel);
      cropRatioSelect.removeEventListener("change", handleRatioChange);
      cropModal.removeEventListener("click", handleBackdropClick);
      document.removeEventListener("keydown", handleKeydown);
      destroyCropper();
      URL.revokeObjectURL(imageUrl);
      cropImage.onload = null;
      cropImage.onerror = null;
      cropImage.removeAttribute("src");
      setModalOpen(false);
    };

    const handleConfirm = () => {
      if (!cropper) return;
      const canvas = cropper.getCroppedCanvas({
        imageSmoothingEnabled: true,
        imageSmoothingQuality: "high",
      });
      cleanup();
      resolve(canvas);
    };

    const handleSkip = async () => {
      try {
        cleanup();
        const canvas = await originalCanvasFromFile(file);
        resolve(canvas);
      } catch (error) {
        reject(error);
      }
    };

    const handleCancel = () => {
      cleanup();
      reject(new UploadCancelledError());
    };

    const handleRatioChange = () => {
      if (!cropper) return;
      const imageData = cropper.getImageData();
      const ratio = getSelectedAspectRatio(imageData.naturalWidth / imageData.naturalHeight);
      cropper.setAspectRatio(ratio);
    };

    const handleBackdropClick = (event) => {
      if (event.target === cropModal) handleCancel();
    };

    const handleKeydown = (event) => {
      if (event.key === "Escape") handleCancel();
    };

    cropFilename.textContent = file.name;
    cropProgress.textContent = `${index}/${total}`;
    cropRatioSelect.value = "free";
    cropImage.onload = () => {
      if (!isActive) return;
      destroyCropper();
      const ratio = cropImage.naturalWidth / cropImage.naturalHeight || 1;
      cropper = new Cropper(cropImage, {
        aspectRatio: getSelectedAspectRatio(ratio),
        autoCropArea: 0.9,
        background: false,
        checkOrientation: true,
        viewMode: 1,
        responsive: true,
      });
    };
    cropImage.onerror = () => {
      cleanup();
      reject(new Error(`无法读取图片：${file.name}`));
    };
    cropImage.src = imageUrl;
    setModalOpen(true);

    confirmCropButton.addEventListener("click", handleConfirm);
    skipCropButton.addEventListener("click", handleSkip);
    cancelCropButton.addEventListener("click", handleCancel);
    cancelCropSecondaryButton.addEventListener("click", handleCancel);
    cropRatioSelect.addEventListener("change", handleRatioChange);
    cropModal.addEventListener("click", handleBackdropClick);
    document.addEventListener("keydown", handleKeydown);
  });
}

async function uploadOne({ file, blob, key, token }) {
  const formData = new FormData();
  formData.append("file", blob, key.split("/").at(-1));
  formData.append("key", key);
  formData.append("contentType", "image/webp");

  const response = await fetch("/api/upload", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `${file.name} 上传失败。`);
  }

  return payload;
}

function buildAltText(baseAlt, baseSlug, index, total) {
  const fallback = baseAlt || baseSlug;
  return total > 1 ? `${fallback} ${String(index).padStart(2, "0")}` : fallback;
}

function buildFormats({ alt, url }) {
  const safeAlt = escapeHtml(alt);
  return {
    markdown: `![${alt}](${url})`,
    html: `<img src="${url}" alt="${safeAlt}" loading="lazy">`,
    hugo: `{{< figure src="${url}" alt="${safeAlt}" >}}`,
  };
}

function setCopyButtonsEnabled() {
  const hasLinks = formatLinks.length > 0;
  copyMarkdownButton.disabled = !hasLinks;
  copySelectedFormatButton.disabled = !hasLinks;
}

function renderResult({ file, key, url, alt, originalSize, compressedSize, dimensions, preset }) {
  const formats = buildFormats({ alt, url });
  formatLinks.push(formats);

  const item = document.createElement("article");
  item.className = "result-item";

  const title = document.createElement("h3");
  title.textContent = file.name;
  item.appendChild(title);

  [
    ["压缩预设", `${preset.label} · quality ${preset.quality}`],
    ["压缩后尺寸", dimensions],
    ["体积对比", `${formatBytes(originalSize)} → ${formatBytes(compressedSize)}（${formatSaving(originalSize, compressedSize)}）`],
    ["Alt", alt],
    ["R2 Key", key],
    ["URL", url],
    ["Markdown", formats.markdown],
    ["HTML", formats.html],
    ["Hugo figure", formats.hugo],
  ].forEach(([label, value]) => {
    const field = document.createElement("div");
    field.className = "result-field";

    const labelElement = document.createElement("span");
    labelElement.textContent = label;

    const code = document.createElement("code");
    code.textContent = value;

    field.append(labelElement, code);
    item.appendChild(field);
  });

  resultsBox.appendChild(item);
  setCopyButtonsEnabled();
}

async function copyFormat(format) {
  await navigator.clipboard.writeText(formatLinks.map((links) => links[format]).join("\n"));
  const label = format === "html" ? "HTML" : format === "hugo" ? "Hugo figure" : "Markdown";
  setStatus(`${label} 链接已复制。`, "success");
}

async function handleUpload() {
  if (isUploading) return;

  const token = tokenInput.value.trim();
  const category = categorySelect.value;
  const baseSlug = slugify(slugInput.value.trim() || selectedFiles[0]?.name || "image");
  const baseAlt = altTextInput.value.trim();
  const namingMode = namingModeSelect.value;

  if (!token) {
    setStatus("请输入上传 Token。", "error");
    tokenInput.focus();
    return;
  }

  if (!selectedFiles.length) {
    setStatus("请先选择要上传的图片。", "error");
    return;
  }

  isUploading = true;
  renderFileList();
  resultsBox.innerHTML = "";
  formatLinks = [];
  setCopyButtonsEnabled();

  try {
    for (const [index, file] of selectedFiles.entries()) {
      const sequence = index + 1;
      setStatus(`正在打开裁剪界面 ${sequence}/${selectedFiles.length}：${file.name}`);
      const canvas = await openCropDialog(file, sequence, selectedFiles.length);
      setStatus(`正在浏览器端压缩 ${sequence}/${selectedFiles.length}：${file.name}`);
      const compressed = await compressCanvasToWebP(canvas, file.name);
      const key = buildKey({
        category,
        baseSlug,
        originalName: file.name,
        index: sequence,
        mode: namingMode,
      });
      const alt = buildAltText(baseAlt, baseSlug, sequence, selectedFiles.length);
      setStatus(`正在上传 ${sequence}/${selectedFiles.length}：${file.name}`);
      const result = await uploadOne({ file, blob: compressed.blob, key, token });
      renderResult({
        file,
        key: result.key,
        url: result.url,
        alt,
        originalSize: file.size,
        compressedSize: compressed.blob.size,
        dimensions: compressed.dimensions,
        preset: compressed.preset,
      });
    }

    setStatus(`上传完成：${selectedFiles.length} 张图片。`, "success");
  } catch (error) {
    const isCancel = error instanceof UploadCancelledError;
    setStatus(error instanceof Error ? error.message : "上传失败，请稍后重试。", isCancel ? "" : "error");
  } finally {
    isUploading = false;
    renderFileList();
  }
}

dropZone.addEventListener("click", () => fileInput.click());
dropZone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    fileInput.click();
  }
});

["dragenter", "dragover"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add("is-dragging");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove("is-dragging");
  });
});

dropZone.addEventListener("drop", (event) => selectFiles(event.dataTransfer.files));
fileInput.addEventListener("change", (event) => {
  selectFiles(event.target.files);
  event.target.value = "";
});
fileList.addEventListener("dragstart", (event) => {
  const item = event.target.closest(".file-item");
  if (!item || isUploading) return;
  draggedFileIndex = Number(item.dataset.index);
  item.classList.add("is-dragging");
  event.dataTransfer.effectAllowed = "move";
});
fileList.addEventListener("dragover", (event) => {
  if (draggedFileIndex === null || isUploading) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
});
fileList.addEventListener("drop", (event) => {
  const item = event.target.closest(".file-item");
  if (!item || draggedFileIndex === null || isUploading) return;
  event.preventDefault();
  moveSelectedFile(draggedFileIndex, Number(item.dataset.index));
});
fileList.addEventListener("dragend", () => {
  draggedFileIndex = null;
  fileList.querySelectorAll(".file-item").forEach((item) => item.classList.remove("is-dragging"));
});
uploadButton.addEventListener("click", handleUpload);
copyMarkdownButton.addEventListener("click", () => copyFormat("markdown"));
copySelectedFormatButton.addEventListener("click", () => copyFormat(copyFormatSelect.value));
