import { STATUS_LABELS } from "./config.js";
import { addFiles, appState, clearItems, moveItem, moveItemTo, removeItem, totalOriginalBytes } from "./state.js";
import { formatBytes, icon } from "./utils.js";

const elements = {
  dropZone: document.querySelector("#drop-zone"),
  fileInput: document.querySelector("#file-input"),
  cameraInput: document.querySelector("#camera-input"),
  choose: document.querySelector("#choose-files"),
  camera: document.querySelector("#take-photo"),
  addMore: document.querySelector("#add-more"),
  clear: document.querySelector("#clear-files"),
  panel: document.querySelector("#selection-panel"),
  summary: document.querySelector("#selection-summary"),
  list: document.querySelector("#file-list"),
  desktopActions: document.querySelector("#desktop-upload-actions"),
  mobileBar: document.querySelector("#mobile-upload-bar"),
  mobileSummary: document.querySelector("#mobile-selection-summary"),
  mobileStatus: document.querySelector("#mobile-upload-status"),
  uploadButtons: [
    document.querySelector("#upload-button"),
    document.querySelector("#direct-upload-button"),
    document.querySelector("#mobile-upload"),
    document.querySelector("#mobile-direct-upload"),
  ],
};

let draggedId = "";
let changeCallback = () => {};
let retryCallback = () => {};
let notify = () => {};

function makeButton({ action, id, label, title = label, iconName, disabled = false, danger = false }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `file-action-button${danger ? " is-danger" : ""}`;
  button.dataset.action = action;
  button.dataset.id = id;
  button.setAttribute("aria-label", label);
  button.title = title;
  button.disabled = disabled;
  button.innerHTML = icon(iconName);
  return button;
}

function renderItem(item, index) {
  const article = document.createElement("article");
  article.className = `file-item is-${item.status}`;
  article.dataset.id = item.id;
  article.setAttribute("role", "listitem");
  article.draggable = !appState.isUploading;

  const handle = document.createElement("button");
  handle.type = "button";
  handle.className = "drag-handle";
  handle.dataset.action = "drag";
  handle.dataset.id = item.id;
  handle.setAttribute("aria-label", `拖动 ${item.file.name} 调整顺序`);
  handle.title = "拖动排序";
  handle.disabled = appState.isUploading;
  handle.innerHTML = icon("grip");

  const thumbWrap = document.createElement("div");
  thumbWrap.className = "file-thumbnail-wrap";
  const thumbnail = document.createElement("img");
  thumbnail.className = "file-thumbnail";
  thumbnail.alt = "";
  thumbnail.src = item.previewUrl || item.result?.url || "";
  const sequence = document.createElement("span");
  sequence.className = "file-sequence";
  sequence.textContent = String(index + 1).padStart(2, "0");
  thumbWrap.append(thumbnail, sequence);

  const details = document.createElement("div");
  details.className = "file-details";
  const name = document.createElement("span");
  name.className = "file-name";
  name.textContent = item.file.name;
  name.title = item.file.name;
  const meta = document.createElement("div");
  meta.className = "file-meta";
  const size = document.createElement("span");
  size.textContent = formatBytes(item.file.size);
  const status = document.createElement("span");
  status.className = "status-badge";
  status.dataset.status = item.status;
  status.textContent = STATUS_LABELS[item.status] || item.status;
  meta.append(size, status);
  details.append(name, meta);
  if (item.error) {
    const error = document.createElement("p");
    error.className = "file-error";
    error.textContent = item.error;
    details.appendChild(error);
  }

  const actions = document.createElement("div");
  actions.className = "file-actions";
  if (item.status === "error" || item.status === "cancelled") {
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "file-retry-button";
    retry.dataset.action = "retry";
    retry.dataset.id = item.id;
    retry.textContent = "重试";
    retry.disabled = appState.isUploading;
    actions.appendChild(retry);
  }
  actions.append(
    makeButton({ action: "up", id: item.id, label: `将 ${item.file.name} 上移`, iconName: "up", disabled: index === 0 || appState.isUploading }),
    makeButton({ action: "down", id: item.id, label: `将 ${item.file.name} 下移`, iconName: "down", disabled: index === appState.items.length - 1 || appState.isUploading }),
    makeButton({ action: "remove", id: item.id, label: `删除 ${item.file.name}`, iconName: "trash", disabled: appState.isUploading, danger: true }),
  );

  article.append(handle, thumbWrap, details, actions);
  return article;
}

export function renderFiles() {
  const hasItems = appState.items.length > 0;
  elements.panel.hidden = !hasItems;
  elements.desktopActions.hidden = !hasItems;
  elements.mobileBar.hidden = !hasItems;
  document.body.classList.toggle("has-mobile-bar", hasItems);

  const totalSize = formatBytes(totalOriginalBytes());
  elements.summary.textContent = hasItems ? `${appState.items.length} 张 · 共 ${totalSize}` : "";
  elements.mobileSummary.textContent = hasItems ? `${appState.items.length} 张 · ${totalSize}` : "已选择 0 张";

  const active = appState.items.find((item) => ["editing", "processing", "uploading"].includes(item.status));
  elements.mobileStatus.textContent = active ? STATUS_LABELS[active.status] : appState.isUploading ? "正在处理" : "等待上传";

  const noActionableItems = !appState.items.some((item) => item.status !== "success");
  for (const button of elements.uploadButtons) {
    button.disabled = !hasItems || appState.isUploading || noActionableItems;
  }

  elements.list.replaceChildren(...appState.items.map(renderItem));
}

function handleNewFiles(files) {
  const { added, invalidCount, duplicateCount } = addFiles(files);
  const notes = [];
  if (added.length) notes.push(`已添加 ${added.length} 张图片`);
  if (duplicateCount) notes.push(`跳过 ${duplicateCount} 个重复文件`);
  if (invalidCount) notes.push(`忽略 ${invalidCount} 个非图片文件`);
  notify(notes.join("；") || "没有可添加的图片。", invalidCount ? "error" : "");
  renderFiles();
  changeCallback();
}

function openFilePicker() {
  if (!appState.isUploading) elements.fileInput.click();
}

export function initializeFiles({ onChange, onRetry, onNotify } = {}) {
  changeCallback = onChange || (() => {});
  retryCallback = onRetry || (() => {});
  notify = onNotify || (() => {});

  elements.choose.addEventListener("click", openFilePicker);
  elements.addMore.addEventListener("click", openFilePicker);
  elements.camera.addEventListener("click", () => {
    if (!appState.isUploading) elements.cameraInput.click();
  });
  elements.dropZone.addEventListener("click", openFilePicker);
  elements.dropZone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openFilePicker();
    }
  });

  for (const input of [elements.fileInput, elements.cameraInput]) {
    input.addEventListener("change", () => {
      handleNewFiles(input.files);
      input.value = "";
    });
  }

  ["dragenter", "dragover"].forEach((eventName) => {
    elements.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      if (!appState.isUploading) elements.dropZone.classList.add("is-dragging");
    });
  });
  ["dragleave", "drop"].forEach((eventName) => {
    elements.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.dropZone.classList.remove("is-dragging");
    });
  });
  elements.dropZone.addEventListener("drop", (event) => {
    if (!appState.isUploading) handleNewFiles(event.dataTransfer.files);
  });

  elements.clear.addEventListener("click", () => {
    if (appState.isUploading) return;
    clearItems();
    renderFiles();
    changeCallback();
    notify("已清空待上传图片。", "");
  });

  elements.list.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button || appState.isUploading) return;
    const { action, id } = button.dataset;
    if (action === "up") moveItem(id, -1);
    if (action === "down") moveItem(id, 1);
    if (action === "remove") removeItem(id);
    if (action === "retry") retryCallback(id);
    renderFiles();
    changeCallback();
  });

  elements.list.addEventListener("dragstart", (event) => {
    const item = event.target.closest(".file-item");
    if (!item || appState.isUploading) return;
    draggedId = item.dataset.id;
    item.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", draggedId);
  });
  elements.list.addEventListener("dragover", (event) => {
    if (!draggedId || appState.isUploading) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  });
  elements.list.addEventListener("drop", (event) => {
    const target = event.target.closest(".file-item");
    if (!target || !draggedId || appState.isUploading) return;
    event.preventDefault();
    moveItemTo(draggedId, target.dataset.id);
    renderFiles();
    changeCallback();
  });
  elements.list.addEventListener("dragend", () => {
    draggedId = "";
    elements.list.querySelectorAll(".file-item").forEach((item) => item.classList.remove("is-dragging"));
  });

  renderFiles();
}
