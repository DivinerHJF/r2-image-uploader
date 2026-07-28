import { ASPECT_RATIOS, LARGE_FILE_BYTES, LARGE_IMAGE_PIXELS } from "./config.js";
import { processCroppedCanvas } from "./image-processing.js";
import { trapFocus } from "./utils.js";

export class CropCancelledError extends Error {
  constructor() {
    super("已取消当前上传批次。");
    this.name = "CropCancelledError";
  }
}

class CropEditor {
  constructor() {
    this.modal = document.querySelector("#crop-modal");
    this.image = document.querySelector("#crop-image");
    this.progress = document.querySelector("#crop-progress");
    this.filename = document.querySelector("#crop-filename");
    this.altInput = document.querySelector("#crop-alt");
    this.confirmButton = document.querySelector("#confirm-crop");
    this.cancelButton = document.querySelector("#cancel-crop");
    this.skipButton = document.querySelector("#skip-crop");
    this.rotateLeft = document.querySelector("#rotate-left");
    this.rotateRight = document.querySelector("#rotate-right");
    this.largeHint = document.querySelector("#large-image-hint");
    this.ratioButtons = Array.from(document.querySelectorAll(".ratio-button"));
    this.cropper = null;
    this.imageUrl = "";
    this.active = null;
    this.previouslyFocused = null;

    this.confirmButton.addEventListener("click", () => this.confirm());
    this.cancelButton.addEventListener("click", () => this.cancel());
    this.skipButton.addEventListener("click", () => this.skip());
    this.rotateLeft.addEventListener("click", () => this.cropper?.rotate(-90));
    this.rotateRight.addEventListener("click", () => this.cropper?.rotate(90));
    this.ratioButtons.forEach((button) => {
      button.addEventListener("click", () => this.selectRatio(button.dataset.ratio));
    });
    this.modal.addEventListener("click", (event) => {
      if (event.target === this.modal && window.innerWidth > 700) this.cancel();
    });
    document.addEventListener("keydown", (event) => {
      if (this.modal.hidden) return;
      if (event.key === "Escape") {
        event.preventDefault();
        this.cancel();
      } else {
        trapFocus(event, this.modal);
      }
    });
  }

  setBusy(isBusy) {
    this.confirmButton.disabled = isBusy;
    this.cancelButton.disabled = isBusy;
    this.skipButton.disabled = isBusy;
    this.rotateLeft.disabled = isBusy;
    this.rotateRight.disabled = isBusy;
    this.ratioButtons.forEach((button) => { button.disabled = isBusy; });
    this.confirmButton.textContent = isBusy ? "处理中…" : "完成";
  }

  selectRatio(key) {
    if (!this.cropper) return;
    this.ratioButtons.forEach((button) => {
      const active = button.dataset.ratio === key;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    const imageData = this.cropper.getImageData();
    const configured = ASPECT_RATIOS[key];
    const ratio = configured === null ? imageData.naturalWidth / imageData.naturalHeight : configured;
    this.cropper.setAspectRatio(ratio);
  }

  open({ item, index, total, initialAlt, preset, onProcessing }) {
    const Cropper = window.Cropper;
    if (!Cropper) throw new Error("裁剪组件加载失败，请检查网络连接后刷新页面。");
    if (this.active) throw new Error("图片编辑器已在使用中。");

    this.previouslyFocused = document.activeElement;
    this.progress.textContent = `第 ${index} 张，共 ${total} 张`;
    this.filename.textContent = item.file.name;
    this.altInput.value = initialAlt;
    this.largeHint.hidden = item.file.size < LARGE_FILE_BYTES;
    this.selectRatioState("free");
    this.setBusy(false);
    this.modal.hidden = false;
    document.body.classList.add("modal-open");
    this.imageUrl = URL.createObjectURL(item.file);

    return new Promise((resolve, reject) => {
      this.active = { resolve, reject, item, preset, onProcessing };
      this.image.onload = () => {
        if (!this.active) return;
        this.largeHint.hidden = this.largeHint.hidden && this.image.naturalWidth * this.image.naturalHeight < LARGE_IMAGE_PIXELS;
        this.cropper = new Cropper(this.image, {
          aspectRatio: NaN,
          autoCropArea: 0.9,
          background: false,
          checkOrientation: true,
          viewMode: 1,
          responsive: true,
          rotatable: true,
        });
        this.modal.querySelectorAll(".cropper-container img").forEach((image) => {
          image.alt = "";
          image.setAttribute("aria-hidden", "true");
        });
        window.setTimeout(() => this.cancelButton.focus(), 0);
      };
      this.image.onerror = () => {
        const error = new Error(`无法读取图片：${item.file.name}`);
        this.finishWithError(error);
      };
      this.image.src = this.imageUrl;
    });
  }

  selectRatioState(key) {
    this.ratioButtons.forEach((button) => {
      const active = button.dataset.ratio === key;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  async confirm() {
    if (!this.active || !this.cropper) return;
    this.setBusy(true);
    this.active.onProcessing?.();
    const options = { imageSmoothingEnabled: true, imageSmoothingQuality: "high" };
    if (Number.isFinite(this.active.preset.maxWidth)) {
      options.maxWidth = this.active.preset.maxWidth;
      options.maxHeight = this.active.preset.maxHeight;
    }

    try {
      const canvas = this.cropper.getCroppedCanvas(options);
      if (!canvas) throw new Error(`无法生成裁剪结果：${this.active.item.file.name}`);
      const processed = await processCroppedCanvas(canvas, this.active.item.file.name, this.active.preset);
      const payload = { kind: "processed", alt: this.currentAlt(), processed };
      const resolve = this.active.resolve;
      this.cleanup();
      resolve(payload);
    } catch (error) {
      this.finishWithError(error);
    }
  }

  skip() {
    if (!this.active) return;
    const resolve = this.active.resolve;
    const payload = { kind: "skip", alt: this.currentAlt() };
    this.cleanup();
    resolve(payload);
  }

  cancel() {
    if (!this.active) return;
    const reject = this.active.reject;
    this.cleanup();
    reject(new CropCancelledError());
  }

  finishWithError(error) {
    if (!this.active) return;
    const reject = this.active.reject;
    this.cleanup();
    reject(error);
  }

  currentAlt() {
    return this.altInput.value.trim() || this.active?.item.alt || "image";
  }

  cleanup() {
    this.cropper?.destroy();
    this.cropper = null;
    if (this.imageUrl) URL.revokeObjectURL(this.imageUrl);
    this.imageUrl = "";
    this.image.onload = null;
    this.image.onerror = null;
    this.image.removeAttribute("src");
    this.altInput.value = "";
    this.modal.hidden = true;
    this.largeHint.hidden = true;
    document.body.classList.remove("modal-open");
    this.active = null;
    this.setBusy(false);
    this.previouslyFocused?.focus();
  }
}

export const cropEditor = new CropEditor();
