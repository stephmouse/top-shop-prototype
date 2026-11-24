import {
  ACCESSORY_LABELS,
  AVATAR_ACCESSORIES,
  AVATAR_EYES,
  AVATAR_HAIRS,
  AVATAR_MARKINGS,
  AVATAR_SPECIES,
  createRandomAvatar,
  createSpeciesPreset,
  EYE_LABELS,
  HAIR_LABELS,
  isValidCustomImageDataUrl,
  MARKING_LABELS,
  SPECIES_LABELS,
  stripAvatarCustomImage,
} from '../config/avatarTypes';
import type { AvatarAccessory, AvatarEyeStyle, AvatarHair, AvatarMarking, AvatarSpec, AvatarSpecies } from '../config/avatarTypes';
import { WALK_SOUND_CHOICE_LABELS, WALK_SOUND_CHOICES } from '../config/walkSounds';
import type { WalkSoundChoice } from '../config/walkSounds';
import { createAvatarElement } from './avatarSvg';
import { createImageCropper } from './imageCropper';

export interface AvatarModalOptions {
  onPreviewWalkSound?: (choice: WalkSoundChoice) => void;
}

export interface AvatarModalController {
  el: HTMLElement;
  open: (initialSpec: AvatarSpec, frameColor: string, title: string, onSave: (next: AvatarSpec) => void) => void;
  close: () => void;
  isOpen: () => boolean;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function createCameraSvg(size: number): Element {
  if (typeof document.createElementNS !== 'function') return mk('span', '');
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const body = document.createElementNS(SVG_NS, 'path');
  body.setAttribute('d', 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z');
  const lens = document.createElementNS(SVG_NS, 'circle');
  lens.setAttribute('cx', '12');
  lens.setAttribute('cy', '13');
  lens.setAttribute('r', '4');
  svg.append(body, lens);
  return svg;
}

const mk = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, textContent = '') =>
  Object.assign(document.createElement(tag), { className, textContent });

function mkSelectField<T extends string>(
  label: string,
  items: readonly T[],
  labels: Record<T, string>,
  value: T,
  onChange: (next: T) => void
): HTMLElement {
  const wrap = mk('label', 'setup-field');
  wrap.appendChild(mk('span', 'setup-field-label', label));
  const sel = mk('select', 'setup-select');
  for (const id of items) {
    sel.appendChild(Object.assign(document.createElement('option'), { value: id, textContent: labels[id] }));
  }
  sel.value = value;
  sel.addEventListener('change', () => onChange(sel.value as T));
  wrap.appendChild(sel);
  return wrap;
}

function mkColorField(label: string, value: string, onChange: (hex: string) => void): HTMLElement {
  const wrap = mk('label', 'setup-field');
  wrap.appendChild(mk('span', 'setup-field-label', label));
  const inp = Object.assign(mk('input', 'setup-color-picker avatar-color-wide'), { type: 'color', value });
  inp.addEventListener('input', () => onChange(inp.value));
  wrap.appendChild(inp);
  return wrap;
}

export function createAvatarModal(options?: AvatarModalOptions): AvatarModalController {
  let visible = false;
  let draft: AvatarSpec = createSpeciesPreset('mouse');
  let frameColor = '#e74c3c';
  let saveCb: ((next: AvatarSpec) => void) | null = null;

  const backdrop = Object.assign(mk('div', 'setup-backdrop avatar-backdrop'), { hidden: true });
  const modal = mk('div', 'setup-modal avatar-modal');
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  backdrop.appendChild(modal);

  const titleEl = mk('h2', 'setup-title', 'Customize Animal Standee');
  const closeTop = Object.assign(mk('button', '', 'Cancel (Esc)'), { type: 'button' as const });
  const header = mk('div', 'setup-header');
  header.append(titleEl, closeTop);

  const layout = mk('div', 'avatar-modal-layout');
  const previewCol = mk('div', 'avatar-preview-col');
  const previewWrap = mk('div', 'avatar-preview-wrap');
  const previewFrame = mk('div', 'avatar-preview-frame');
  const uploadBtn = Object.assign(mk('button', 'avatar-upload-btn'), {
    type: 'button' as const,
    title: 'Upload avatar',
  });
  uploadBtn.setAttribute('aria-label', 'Upload avatar');
  const uploadTooltip = mk('span', 'avatar-upload-tooltip', 'Upload avatar');
  uploadBtn.append(createCameraSvg(16), uploadTooltip);
  const fileInput = Object.assign(document.createElement('input'), {
    type: 'file',
    accept: 'image/png,image/jpeg,image/webp,image/gif,image/avif',
    hidden: true,
  });
  previewWrap.append(previewFrame, uploadBtn, fileInput);

  const quickBtns = mk('div', 'setup-btn-row');
  const paletteBtn = Object.assign(mk('button', '', 'Species Palette'), { type: 'button' as const });
  const randomBtn = Object.assign(mk('button', '', 'Randomize'), { type: 'button' as const });
  const clearPhotoBtn = Object.assign(mk('button', '', 'Clear Photo'), { type: 'button' as const, hidden: true });
  quickBtns.append(paletteBtn, randomBtn, clearPhotoBtn);
  previewCol.append(previewWrap, quickBtns);

  const controlsCol = mk('div', 'avatar-controls-col');
  const errorEl = Object.assign(mk('div', 'setup-status is-error'), { hidden: true });
  const photoBanner = Object.assign(
    mk('div', 'avatar-photo-banner', 'Custom portrait active — edit any animal control below or click Clear Photo to switch back.'),
    { hidden: true }
  );
  layout.append(previewCol, controlsCol);

  const cancelBtn = Object.assign(mk('button', '', 'Cancel'), { type: 'button' as const });
  const saveBtn = Object.assign(mk('button', 'primary', 'Apply Standee'), { type: 'button' as const });
  const footer = mk('div', 'setup-footer');
  footer.append(cancelBtn, saveBtn);

  const setCropMode = (active: boolean): void => {
    layout.hidden = active;
    footer.hidden = active;
    cropper.el.hidden = !active;
  };
  const showError = (msg: string): void => {
    errorEl.textContent = msg;
    errorEl.hidden = !msg;
  };
  const cropper = createImageCropper({
    onConfirm: (dataUrl) => {
      draft = { ...draft, customImage: dataUrl };
      setCropMode(false);
      showError('');
      renderControls();
    },
    onCancel: () => {
      setCropMode(false);
      cropper.reset();
    },
    onError: (msg) => {
      setCropMode(false);
      cropper.reset();
      showError(msg);
    },
  });

  modal.append(header, errorEl, layout, cropper.el, footer);

  function close(): void {
    visible = false;
    backdrop.hidden = true;
    saveCb = null;
    setCropMode(false);
    cropper.reset();
    showError('');
  }

  function refreshPreview(): void {
    const hasCustom = isValidCustomImageDataUrl(draft.customImage);
    clearPhotoBtn.hidden = !hasCustom;
    photoBanner.hidden = !hasCustom;
    previewFrame.innerHTML = '';
    previewFrame.style.borderColor = frameColor;
    previewFrame.appendChild(createAvatarElement(draft, frameColor));
  }

  function updateBuilder(patch: Partial<AvatarSpec>): void {
    draft = { ...(stripAvatarCustomImage(draft) ?? draft), ...patch };
    refreshPreview();
  }

  function renderControls(): void {
    controlsCol.innerHTML = '';

    const gridA = mk('div', 'setup-grid');
    gridA.append(
      mkSelectField<AvatarSpecies>('Species', AVATAR_SPECIES, SPECIES_LABELS, draft.species, (v) => updateBuilder({ species: v })),
      mkSelectField<AvatarMarking>('Coat Markings', AVATAR_MARKINGS, MARKING_LABELS, draft.marking, (v) => updateBuilder({ marking: v })),
      mkSelectField<AvatarHair>('Hair Style', AVATAR_HAIRS, HAIR_LABELS, draft.hair, (v) => updateBuilder({ hair: v })),
      mkSelectField<AvatarEyeStyle>('Eyes / Mood', AVATAR_EYES, EYE_LABELS, draft.eyeStyle, (v) => updateBuilder({ eyeStyle: v })),
      mkSelectField<AvatarAccessory>('Accessory', AVATAR_ACCESSORIES, ACCESSORY_LABELS, draft.accessory, (v) => updateBuilder({ accessory: v }))
    );

    const colorsGrid = mk('div', 'avatar-color-grid');
    colorsGrid.append(
      mkColorField('Fur / Scales', draft.primaryColor, (v) => updateBuilder({ primaryColor: v })),
      mkColorField('Markings', draft.secondaryColor, (v) => updateBuilder({ secondaryColor: v })),
      mkColorField('Hair', draft.hairColor, (v) => updateBuilder({ hairColor: v })),
      mkColorField('Eyes', draft.eyeColor, (v) => updateBuilder({ eyeColor: v }))
    );

    const walkRow = mk('div', 'avatar-walk-row');
    const testSoundBtn = Object.assign(mk('button', '', '🔊 Test'), { type: 'button' as const });
    testSoundBtn.addEventListener('click', () => options?.onPreviewWalkSound?.(draft.walkSound ?? 'chirp'));
    walkRow.append(
      mkSelectField<WalkSoundChoice>(
        'Walk Shoes (9-pt Bank Unlock)',
        WALK_SOUND_CHOICES,
        WALK_SOUND_CHOICE_LABELS,
        draft.walkSound ?? 'chirp',
        (v) => {
          draft = { ...draft, walkSound: v };
          options?.onPreviewWalkSound?.(v);
        }
      ),
      testSoundBtn
    );

    controlsCol.append(photoBanner, gridA, colorsGrid, walkRow);
    refreshPreview();
  }

  uploadBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    showError('');
    setCropMode(true);
    cropper.loadFile(file, frameColor);
  });
  clearPhotoBtn.addEventListener('click', () => {
    draft = stripAvatarCustomImage(draft) ?? draft;
    refreshPreview();
  });
  paletteBtn.addEventListener('click', () => {
    const p = createSpeciesPreset(draft.species);
    draft = { ...(stripAvatarCustomImage(draft) ?? draft), primaryColor: p.primaryColor, secondaryColor: p.secondaryColor, marking: p.marking };
    renderControls();
  });
  randomBtn.addEventListener('click', () => {
    draft = { ...createRandomAvatar(), ...(draft.walkSound ? { walkSound: draft.walkSound } : {}) };
    renderControls();
  });
  closeTop.addEventListener('click', close);
  cancelBtn.addEventListener('click', close);
  saveBtn.addEventListener('click', () => { saveCb?.({ ...draft }); close(); });
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });

  return {
    el: backdrop,
    open: (initialSpec, color, title, onSave) => {
      draft = { ...initialSpec };
      frameColor = color;
      titleEl.textContent = title;
      saveCb = onSave;
      visible = true;
      backdrop.hidden = false;
      setCropMode(false);
      cropper.reset();
      showError('');
      renderControls();
    },
    close,
    isOpen: () => visible,
  };
}
