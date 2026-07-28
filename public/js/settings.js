import { COMPRESSION_PRESETS, STORAGE_KEYS } from "./config.js";
import { buildKey, slugify, trapFocus } from "./utils.js";

const elements = {
  open: document.querySelector("#open-settings"),
  dialog: document.querySelector("#settings-dialog"),
  close: document.querySelector("#close-settings"),
  save: document.querySelector("#save-settings"),
  clear: document.querySelector("#clear-token"),
  toggle: document.querySelector("#toggle-token"),
  token: document.querySelector("#token"),
  remember: document.querySelector("#remember-token"),
  tokenStatus: document.querySelector("#token-save-status"),
  tokenIndicator: document.querySelector("#token-indicator"),
  category: document.querySelector("#category"),
  slug: document.querySelector("#slug"),
  alt: document.querySelector("#alt-text"),
  compression: document.querySelector("#compression-preset"),
  naming: document.querySelector("#naming-mode"),
  conflict: document.querySelector("#conflict-policy"),
  copyFormat: document.querySelector("#copy-format"),
  path: document.querySelector("#path-preview"),
  pathNote: document.querySelector("#path-preview-note"),
  savedHint: document.querySelector("#saved-settings-hint"),
};

const validPreferences = {
  category: new Set(["blog", "travel", "books", "tailor", "misc"]),
  compression: new Set(Object.keys(COMPRESSION_PRESETS)),
  naming: new Set(["category-date-sequence", "category-sequence", "date-category-sequence", "category-timestamp", "category-original"]),
  copyFormat: new Set(["markdown", "html", "hugo"]),
};

let previouslyFocused = null;
let changeCallback = () => {};
let hintTimer = null;

function updateTokenIndicator() {
  const isSet = Boolean(elements.token.value.trim());
  elements.tokenIndicator.classList.toggle("is-set", isSet);
  elements.tokenIndicator.setAttribute("aria-label", isSet ? "Token 已设置" : "Token 未设置");
}

function restorePreferences() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.preferences) || "{}");
    for (const [key, allowed] of Object.entries(validPreferences)) {
      if (!allowed.has(parsed[key])) continue;
      const element = elements[key];
      if (element) element.value = parsed[key];
    }
  } catch {
    localStorage.removeItem(STORAGE_KEYS.preferences);
  }

  try {
    elements.token.value = sessionStorage.getItem(STORAGE_KEYS.token) || "";
  } catch {
    elements.token.value = "";
    elements.remember.checked = false;
  }
  elements.conflict.value = "rename";
  updateTokenIndicator();
}

function savePreferences() {
  const preferences = {
    category: elements.category.value,
    compression: elements.compression.value,
    naming: elements.naming.value,
    copyFormat: elements.copyFormat.value,
  };
  try {
    localStorage.setItem(STORAGE_KEYS.preferences, JSON.stringify(preferences));
  } catch {
    return;
  }

  elements.savedHint.textContent = "已保存";
  clearTimeout(hintTimer);
  hintTimer = window.setTimeout(() => {
    elements.savedHint.textContent = "自动保存";
  }, 1300);
}

function closeDialog() {
  if (elements.dialog.open) elements.dialog.close();
  document.body.classList.remove("modal-open");
  previouslyFocused?.focus();
}

export function openSettings(message = "") {
  previouslyFocused = document.activeElement;
  elements.tokenStatus.textContent = message;
  elements.dialog.showModal();
  document.body.classList.add("modal-open");
  window.setTimeout(() => elements.token.focus(), 0);
}

function saveToken() {
  const token = elements.token.value.trim();
  elements.token.value = token;
  try {
    if (elements.remember.checked && token) {
      sessionStorage.setItem(STORAGE_KEYS.token, token);
    } else {
      sessionStorage.removeItem(STORAGE_KEYS.token);
    }
  } catch {
    elements.tokenStatus.textContent = "浏览器阻止了会话存储；Token 仅保留到刷新前。";
    updateTokenIndicator();
    return;
  }
  elements.tokenStatus.textContent = token ? "Token 已保存到本次会话。" : "未填写 Token。";
  updateTokenIndicator();
  window.setTimeout(closeDialog, 320);
}

function clearToken() {
  elements.token.value = "";
  elements.token.type = "password";
  try {
    sessionStorage.removeItem(STORAGE_KEYS.token);
  } catch {
    // The in-memory value is still cleared if storage is unavailable.
  }
  elements.tokenStatus.textContent = "Token 已清除。";
  updateTokenIndicator();
  elements.token.focus();
}

function toggleTokenVisibility() {
  const reveal = elements.token.type === "password";
  elements.token.type = reveal ? "text" : "password";
  elements.toggle.setAttribute("aria-label", reveal ? "隐藏 Token" : "显示 Token");
  elements.toggle.setAttribute("title", reveal ? "隐藏 Token" : "显示 Token");
  elements.token.focus();
}

export function getUploadSettings(items) {
  const firstName = items[0]?.file.name || "image";
  const baseSlug = slugify(elements.slug.value.trim() || firstName);
  return {
    token: elements.token.value.trim(),
    category: elements.category.value,
    baseSlug,
    baseAlt: elements.alt.value.trim(),
    preset: COMPRESSION_PRESETS[elements.compression.value] || COMPRESSION_PRESETS.balanced,
    presetId: elements.compression.value,
    namingMode: elements.naming.value,
    conflictPolicy: elements.conflict.value,
    copyFormat: elements.copyFormat.value,
  };
}

export function updatePathPreview(items) {
  const settings = getUploadSettings(items);
  const firstName = items[0]?.file.name || "image";
  elements.path.textContent = buildKey({
    category: settings.category,
    baseSlug: settings.baseSlug,
    originalName: firstName,
    index: 1,
    mode: settings.namingMode,
  });
  elements.pathNote.textContent = items.length > 1
    ? `显示第 1 张；后续 ${items.length - 1} 张会按当前顺序自动递增。冲突时以最终返回路径为准。`
    : items.length === 1
      ? "冲突时会按所选策略处理，上传结果显示最终路径。"
      : "选择图片后显示实际预览。";
}

export function initializeSettings({ onChange } = {}) {
  changeCallback = onChange || (() => {});
  restorePreferences();

  elements.open.addEventListener("click", () => openSettings());
  elements.close.addEventListener("click", closeDialog);
  elements.save.addEventListener("click", saveToken);
  elements.clear.addEventListener("click", clearToken);
  elements.toggle.addEventListener("click", toggleTokenVisibility);
  elements.token.addEventListener("input", updateTokenIndicator);

  elements.dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeDialog();
  });
  elements.dialog.addEventListener("click", (event) => {
    if (event.target === elements.dialog) closeDialog();
  });
  elements.dialog.addEventListener("keydown", (event) => trapFocus(event, elements.dialog));

  [elements.category, elements.compression, elements.naming, elements.copyFormat].forEach((element) => {
    element.addEventListener("change", () => {
      savePreferences();
      changeCallback();
    });
  });
  [elements.slug, elements.alt, elements.conflict].forEach((element) => {
    element.addEventListener("input", changeCallback);
    element.addEventListener("change", changeCallback);
  });

  changeCallback();
}
