const MAX_WIDTH = 1600;
const MAX_HEIGHT = 1600;
const WEBP_QUALITY = 0.82;
const CATEGORIES = new Set(["blog", "travel", "books", "misc"]);
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
const dropZone = document.querySelector("#drop-zone");
const fileInput = document.querySelector("#file-input");
const fileList = document.querySelector("#file-list");
const uploadButton = document.querySelector("#upload-button");
const statusBox = document.querySelector("#status");
const resultsBox = document.querySelector("#results");
const copyMarkdownButton = document.querySelector("#copy-markdown");
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
let markdownLinks = [];
let cropper = null;

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

function getDatePath(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}/${month}`;
}

function buildKey(category, slug, index) {
  const safeCategory = CATEGORIES.has(category) ? category : "misc";
  const sequence = String(index).padStart(2, "0");
  return `${safeCategory}/${getDatePath()}/${slug}-${sequence}.webp`;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function renderFileList() {
  fileList.innerHTML = "";
  uploadButton.disabled = selectedFiles.length === 0;

  selectedFiles.forEach((file) => {
    const item = document.createElement("div");
    item.className = "file-item";

    const name = document.createElement("span");
    name.textContent = file.name;

    const size = document.createElement("small");
    size.textContent = formatBytes(file.size);

    item.append(name, size);
    fileList.appendChild(item);
  });
}

function selectFiles(files) {
  selectedFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));
  renderFileList();
  setStatus(
    selectedFiles.length ? `已选择 ${selectedFiles.length} 张图片。点击上传后会逐张裁剪。` : "请选择图片文件。",
    selectedFiles.length ? "" : "error",
  );
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

function calculateSize(width, height) {
  const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height, 1);
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

function resizeCanvas(sourceCanvas) {
  const { width, height } = calculateSize(sourceCanvas.width, sourceCanvas.height);
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

function canvasToWebPBlob(canvas, fileName) {
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
      WEBP_QUALITY,
    );
  });
}

async function compressCanvasToWebP(sourceCanvas, fileName) {
  const resizedCanvas = resizeCanvas(sourceCanvas);
  return canvasToWebPBlob(resizedCanvas, fileName);
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
      if (event.target === cropModal) {
        handleCancel();
      }
    };

    const handleKeydown = (event) => {
      if (event.key === "Escape") {
        handleCancel();
      }
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
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `${file.name} 上传失败。`);
  }

  return payload;
}

function renderResult({ file, key, url }) {
  const alt = key.split("/").at(-1).replace(/-\d+\.webp$/, "");
  const markdown = `![${alt}](${url})`;
  markdownLinks.push(markdown);

  const item = document.createElement("article");
  item.className = "result-item";

  const title = document.createElement("h3");
  title.textContent = file.name;
  item.appendChild(title);

  [
    ["R2 Key", key],
    ["URL", url],
    ["Markdown", markdown],
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
  copyMarkdownButton.disabled = markdownLinks.length === 0;
}

async function handleUpload() {
  const token = tokenInput.value.trim();
  const category = categorySelect.value;
  const baseSlug = slugify(slugInput.value.trim() || selectedFiles[0]?.name || "image");

  if (!token) {
    setStatus("请输入上传 Token。", "error");
    tokenInput.focus();
    return;
  }

  if (!selectedFiles.length) {
    setStatus("请先选择要上传的图片。", "error");
    return;
  }

  uploadButton.disabled = true;
  resultsBox.innerHTML = "";
  markdownLinks = [];
  copyMarkdownButton.disabled = true;

  try {
    for (const [index, file] of selectedFiles.entries()) {
      setStatus(`正在裁剪 ${index + 1}/${selectedFiles.length}：${file.name}`);
      const canvas = await openCropDialog(file, index + 1, selectedFiles.length);
      setStatus(`正在压缩并上传 ${index + 1}/${selectedFiles.length}：${file.name}`);
      const blob = await compressCanvasToWebP(canvas, file.name);
      const key = buildKey(category, baseSlug, index + 1);
      const result = await uploadOne({ file, blob, key, token });
      renderResult({ file, key: result.key, url: result.url });
    }

    setStatus(`上传完成：${selectedFiles.length} 张图片。`, "success");
  } catch (error) {
    const isCancel = error instanceof UploadCancelledError;
    setStatus(error instanceof Error ? error.message : "上传失败，请稍后重试。", isCancel ? "" : "error");
  } finally {
    uploadButton.disabled = selectedFiles.length === 0;
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
fileInput.addEventListener("change", (event) => selectFiles(event.target.files));
uploadButton.addEventListener("click", handleUpload);
copyMarkdownButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(markdownLinks.join("\n"));
  setStatus("Markdown 链接已复制。", "success");
});
