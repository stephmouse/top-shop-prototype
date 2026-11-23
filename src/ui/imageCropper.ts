import { isValidCustomImageDataUrl } from '../config/avatarTypes';

export interface ImageCropperOptions {
  onConfirm: (dataUrl: string) => void;
  onCancel: () => void;
  onError: (message: string) => void;
}

export interface ImageCropperController {
  el: HTMLElement;
  loadFile: (file: File, frameColor: string) => void;
  reset: () => void;
}

const VIEW_SIZE = 200;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

const ENCODE_LADDER: ReadonlyArray<{ size: number; mime: string; q?: number }> = [
  { size: 96, mime: 'image/webp', q: 0.86 }, { size: 96, mime: 'image/webp', q: 0.72 },
  { size: 96, mime: 'image/webp', q: 0.56 }, { size: 64, mime: 'image/webp', q: 0.78 },
  { size: 96, mime: 'image/png' },
  { size: 96, mime: 'image/jpeg', q: 0.82 }, { size: 96, mime: 'image/jpeg', q: 0.65 },
  { size: 64, mime: 'image/jpeg', q: 0.75 }, { size: 64, mime: 'image/png' },
];

const mk = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, textContent = '') =>
  Object.assign(document.createElement(tag), { className, textContent });

function validateImageFile(file: File): string | null {
  if (file.type === 'image/svg+xml' || /\.svgz?$/i.test(file.name)) {
    return 'SVG files are not allowed for security reasons. Please upload PNG, JPG, WebP, GIF, or AVIF.';
  }
  if (file.size > MAX_UPLOAD_BYTES) return 'Image file is too large (max 15 MB).';
  if (file.type && !file.type.startsWith('image/')) return 'Please select a raster image file (PNG, JPG, WebP, GIF, or AVIF).';
  return null;
}

function encodeScaledPortrait(img: HTMLImageElement, srcX: number, srcY: number, srcW: number, srcH: number): string | null {
  const offscreen = document.createElement('canvas');
  for (const step of ENCODE_LADDER) {
    offscreen.width = step.size; offscreen.height = step.size;
    const octx = offscreen.getContext?.('2d');
    if (!octx) continue;
    octx.clearRect(0, 0, step.size, step.size);
    if (step.mime === 'image/jpeg') { octx.fillStyle = '#141b29'; octx.fillRect(0, 0, step.size, step.size); }
    octx.imageSmoothingEnabled = true;
    octx.imageSmoothingQuality = 'high';
    octx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, step.size, step.size);
    const url = step.q !== undefined ? offscreen.toDataURL(step.mime, step.q) : offscreen.toDataURL(step.mime);
    if (url.startsWith(`data:${step.mime};`) && isValidCustomImageDataUrl(url)) return url;
  }
  return null;
}

export function createImageCropper(options: ImageCropperOptions): ImageCropperController {
  let loadedImg: HTMLImageElement | null = null, objectUrl: string | null = null;
  let loadSeq = 0, frameColor = '#58a6ff', zoom = 1, panX = 0, panY = 0;
  let dragging = false, startX = 0, startY = 0, startPanX = 0, startPanY = 0;

  const wrap = Object.assign(mk('div', 'cropper-wrap'), { hidden: true });
  const canvas = Object.assign(mk('canvas', 'cropper-canvas'), { width: VIEW_SIZE, height: VIEW_SIZE });
  const zoomRow = mk('label', 'cropper-zoom-row');
  const zoomSlider = Object.assign(mk('input', 'cropper-slider'), {
    type: 'range', min: String(MIN_ZOOM), max: String(MAX_ZOOM), step: '0.02', value: '1',
  });
  const zoomText = mk('span', 'setup-muted', '1.0×');
  zoomRow.append(mk('span', 'setup-field-label', 'Zoom'), zoomSlider, zoomText);

  const hint = mk('div', 'setup-muted', 'Drag photo to center inside the ring · Scroll or slide to zoom');
  const btnRow = mk('div', 'setup-btn-row');
  const backBtn = Object.assign(mk('button', '', 'Back'), { type: 'button' as const });
  const resetBtn = Object.assign(mk('button', '', 'Reset Crop'), { type: 'button' as const });
  const confirmBtn = Object.assign(mk('button', 'primary', 'Use Cropped Portrait'), { type: 'button' as const, disabled: true });
  btnRow.append(backBtn, resetBtn, confirmBtn);
  wrap.append(canvas, zoomRow, hint, btnRow);

  const revokeActiveUrl = () => { if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; } };

  function getMetrics() {
    if (!loadedImg || loadedImg.naturalWidth <= 0 || loadedImg.naturalHeight <= 0) return null;
    const nw = loadedImg.naturalWidth, nh = loadedImg.naturalHeight;
    const scale = Math.max(VIEW_SIZE / nw, VIEW_SIZE / nh) * zoom;
    const drawW = nw * scale, drawH = nh * scale;
    return { img: loadedImg, nw, nh, scale, drawW, drawH, maxPanX: Math.max(0, (drawW - VIEW_SIZE) / 2), maxPanY: Math.max(0, (drawH - VIEW_SIZE) / 2) };
  }

  function clampPan(): void {
    const m = getMetrics();
    if (!m) { panX = 0; panY = 0; return; }
    panX = Math.max(-m.maxPanX, Math.min(m.maxPanX, panX));
    panY = Math.max(-m.maxPanY, Math.min(m.maxPanY, panY));
  }

  function redraw(): void {
    const ctx = canvas.getContext?.('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, VIEW_SIZE, VIEW_SIZE);
    ctx.fillStyle = '#141b29';
    ctx.fillRect(0, 0, VIEW_SIZE, VIEW_SIZE);

    const m = getMetrics();
    if (m) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(m.img, (VIEW_SIZE - m.drawW) / 2 + panX, (VIEW_SIZE - m.drawH) / 2 + panY, m.drawW, m.drawH);
    }

    const r = VIEW_SIZE / 2 - 3;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, VIEW_SIZE, VIEW_SIZE);
    ctx.arc(VIEW_SIZE / 2, VIEW_SIZE / 2, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(8, 11, 16, 0.58)';
    ctx.fill('evenodd');
    ctx.beginPath();
    ctx.arc(VIEW_SIZE / 2, VIEW_SIZE / 2, r, 0, Math.PI * 2);
    ctx.strokeStyle = frameColor;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }

  function setZoom(nextZoom: number): void {
    const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom));
    const ratio = zoom > 0 ? clamped / zoom : 1;
    zoom = clamped; panX *= ratio; panY *= ratio; clampPan();
    zoomSlider.value = clamped.toFixed(2);
    zoomText.textContent = `${clamped.toFixed(1)}×`;
    redraw();
  }

  function resetTransform(): void {
    zoom = 1; panX = 0; panY = 0; zoomSlider.value = '1'; zoomText.textContent = '1.0×'; redraw();
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (!loadedImg) return;
    dragging = true; startX = e.clientX; startY = e.clientY; startPanX = panX; startPanY = panY;
    canvas.className = 'cropper-canvas is-dragging';
    canvas.setPointerCapture?.(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const rect = canvas.getBoundingClientRect();
    const factor = rect.width > 0 ? VIEW_SIZE / rect.width : 1;
    panX = startPanX + (e.clientX - startX) * factor;
    panY = startPanY + (e.clientY - startY) * factor;
    clampPan(); redraw();
  });
  const endDrag = () => { dragging = false; canvas.className = 'cropper-canvas'; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('wheel', (e) => {
    if (!loadedImg) return;
    e.preventDefault();
    setZoom(zoom + (e.deltaY < 0 ? 0.14 : -0.14));
  }, { passive: false });

  zoomSlider.addEventListener('input', () => setZoom(Number(zoomSlider.value)));
  resetBtn.addEventListener('click', resetTransform);
  backBtn.addEventListener('click', () => options.onCancel());
  confirmBtn.addEventListener('click', () => {
    const m = getMetrics();
    if (!m) return options.onError('Could not compress cropped portrait under 16 KB. Try another photo.');
    const srcX = Math.max(0, -((VIEW_SIZE - m.drawW) / 2 + panX) / m.scale);
    const srcY = Math.max(0, -((VIEW_SIZE - m.drawH) / 2 + panY) / m.scale);
    const out = encodeScaledPortrait(m.img, srcX, srcY, Math.min(m.nw - srcX, VIEW_SIZE / m.scale), Math.min(m.nh - srcY, VIEW_SIZE / m.scale));
    if (!out) return options.onError('Could not compress cropped portrait under 16 KB. Try another photo.');
    options.onConfirm(out);
  });

  function reset(): void {
    loadSeq++; loadedImg = null; dragging = false; confirmBtn.disabled = true;
    canvas.className = 'cropper-canvas';
    revokeActiveUrl(); resetTransform();
  }

  function loadFile(file: File, nextFrameColor: string): void {
    frameColor = nextFrameColor;
    const err = validateImageFile(file);
    if (err) { options.onError(err); return; }
    reset();
    const seq = loadSeq;
    const url = (objectUrl = URL.createObjectURL(file));
    const img = new Image();
    img.onload = () => {
      if (seq === loadSeq) { loadedImg = img; confirmBtn.disabled = false; revokeActiveUrl(); resetTransform(); }
      else URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      if (seq === loadSeq) {
        revokeActiveUrl(); loadedImg = null;
        options.onError('Could not decode image. Use PNG, JPG, WebP, GIF, or AVIF (TIFF is not natively supported in most browsers).');
      } else URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  return { el: wrap, loadFile, reset };
}
