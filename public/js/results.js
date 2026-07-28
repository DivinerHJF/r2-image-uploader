import { appState, getCounts } from "./state.js";
import { buildFormats, copyText, formatBytes, formatSaving, icon, prefersReducedMotion } from "./utils.js";

const elements = {
  section: document.querySelector("#results-section"),
  status: document.querySelector("#status"),
  summary: document.querySelector("#upload-summary"),
  progress: document.querySelector("#batch-progress"),
  progressBar: document.querySelector("#progress-bar"),
  progressLabel: document.querySelector("#progress-label"),
  copyToolbar: document.querySelector("#copy-toolbar"),
  copyFormat: document.querySelector("#copy-format"),
  copyAll: document.querySelector("#copy-all"),
  retryFailed: document.querySelector("#retry-failed"),
  results: document.querySelector("#results"),
};

let retryCallback = () => {};
let notify = () => {};

export function setStatus(message, type = "") {
  elements.status.textContent = message;
  elements.status.className = `status${type ? ` is-${type}` : ""}`;
}

export function showResults() {
  elements.section.hidden = false;
}

function successfulItems() {
  return appState.items.filter((item) => item.status === "success" && item.result);
}

function updateSummary() {
  const counts = getCounts();
  const completed = counts.success + counts.error + counts.cancelled;
  const percent = counts.total ? (completed / counts.total) * 100 : 0;
  elements.progress.hidden = !appState.isUploading;
  elements.progressBar.style.width = `${percent}%`;
  elements.progressLabel.textContent = `${completed} / ${counts.total}`;

  if (appState.isUploading) {
    elements.summary.textContent = `正在处理：成功 ${counts.success} 张，失败 ${counts.error} 张`;
  } else if (appState.uploadStarted) {
    elements.summary.textContent = `上传完成：成功 ${counts.success} 张，失败 ${counts.error} 张，取消 ${counts.cancelled} 张`;
  }
  elements.retryFailed.hidden = counts.error === 0 || appState.isUploading;
  elements.copyToolbar.hidden = successfulItems().length === 0;
}

function makeDetail(label, value) {
  const row = document.createElement("div");
  row.className = "detail-row";
  const title = document.createElement("span");
  title.textContent = label;
  const code = document.createElement("code");
  code.textContent = value;
  row.append(title, code);
  return row;
}

function makeResultCard(item) {
  const { result } = item;
  const formats = result.formats || buildFormats({ alt: result.alt, url: result.url });
  const card = document.createElement("article");
  card.className = "result-item";

  const image = document.createElement("img");
  image.className = "result-thumb";
  image.src = result.url;
  image.alt = "";
  image.loading = "lazy";

  const main = document.createElement("div");
  main.className = "result-main";
  const titleWrap = document.createElement("div");
  titleWrap.className = "result-title";
  const check = document.createElement("span");
  check.className = "status-icon";
  check.innerHTML = icon("check");
  const title = document.createElement("h3");
  title.textContent = item.file.name;
  title.title = item.file.name;
  titleWrap.append(check, title);
  const size = document.createElement("p");
  size.className = "result-size";
  size.textContent = `${formatBytes(item.file.size)} → ${formatBytes(result.compressedSize)} · ${formatSaving(item.file.size, result.compressedSize)}`;
  const key = document.createElement("code");
  key.className = "result-key";
  key.textContent = result.key;
  main.append(titleWrap, size, key);

  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "primary-button compact-button result-copy-button";
  copy.dataset.action = "copy-one";
  copy.dataset.id = item.id;
  copy.textContent = `复制 ${formatLabel(elements.copyFormat.value)}`;

  const details = document.createElement("details");
  details.className = "result-details";
  const summary = document.createElement("summary");
  summary.textContent = "查看详情";
  const grid = document.createElement("div");
  grid.className = "details-grid";
  [
    ["完整公开 URL", result.url],
    ["R2 Key", result.key],
    ["Markdown", formats.markdown],
    ["HTML", formats.html],
    ["Hugo figure", formats.hugo],
    ["压缩设置", `${result.preset.label} · quality ${result.preset.quality}`],
    ["图片尺寸", result.dimensions],
    ["Alt", result.alt],
  ].forEach(([label, value]) => grid.appendChild(makeDetail(label, value)));
  details.append(summary, grid);

  card.append(image, main, copy, details);
  return card;
}

function formatLabel(format) {
  if (format === "html") return "HTML";
  if (format === "hugo") return "Hugo figure";
  return "Markdown";
}

async function copyItems(items, format, button) {
  const text = items.map((item) => item.result.formats[format]).join("\n");
  await copyText(text);
  const original = button.textContent;
  button.textContent = "已复制";
  notify(`${formatLabel(format)} 链接已复制。`, "success");
  window.setTimeout(() => { button.textContent = original; }, 1200);
}

export function renderResults() {
  if (!appState.uploadStarted) return;
  showResults();
  updateSummary();
  elements.results.replaceChildren(...successfulItems().map(makeResultCard));
}

export function scrollToResults() {
  elements.section.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
}

export function initializeResults({ onRetryFailed, onNotify } = {}) {
  retryCallback = onRetryFailed || (() => {});
  notify = onNotify || (() => {});
  elements.retryFailed.addEventListener("click", retryCallback);
  elements.copyAll.addEventListener("click", async () => {
    try {
      await copyItems(successfulItems(), elements.copyFormat.value, elements.copyAll);
    } catch (error) {
      notify(error instanceof Error ? error.message : "复制失败。", "error");
    }
  });
  elements.copyFormat.addEventListener("change", renderResults);
  elements.results.addEventListener("click", async (event) => {
    const button = event.target.closest('button[data-action="copy-one"]');
    if (!button) return;
    const item = appState.items.find((candidate) => candidate.id === button.dataset.id);
    if (!item?.result) return;
    try {
      await copyItems([item], elements.copyFormat.value, button);
    } catch (error) {
      notify(error instanceof Error ? error.message : "复制失败。", "error");
    }
  });
}
