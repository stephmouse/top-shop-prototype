import { PLAYER_COLORS } from '../config/balance';
import { AVATAR_COLOR_SWATCHES, createColorPicker, normalizeHex } from './colorPicker';
import type { ColorPickerController } from './colorPicker';

export const PLAYER_COLOR_SWATCHES: readonly string[] = [
  ...PLAYER_COLORS,
  ...AVATAR_COLOR_SWATCHES.filter((c) => !(PLAYER_COLORS as readonly string[]).includes(c.toLowerCase())),
];

export interface ColorPickerButtonOptions {
  initialColor: string;
  swatches?: readonly string[];
  label?: string;
  title?: string;
  disabled?: boolean;
  onChange?: (hex: string) => void;
  onCommit?: (hex: string) => void;
}

export interface ColorPickerButtonController {
  el: HTMLButtonElement;
  getColor: () => string;
  setColor: (hex: string) => void;
  close: () => void;
}

let activeCloseFn: (() => void) | null = null;
let activeTriggerEl: HTMLButtonElement | null = null;

/** Computes viewport-clamped popover coordinates, preferring below the trigger and flipping above when needed. */
export function computePopoverPosition(
  triggerRect: { left: number; top: number; bottom: number; width: number },
  popWidth: number,
  popHeight: number,
  viewportWidth: number,
  viewportHeight: number
): { left: number; top: number } {
  const margin = 10;
  const gap = 6;
  const preferredTop = triggerRect.bottom + gap;
  const top =
    preferredTop + popHeight > viewportHeight - margin
      ? Math.max(margin, triggerRect.top - popHeight - gap)
      : Math.max(margin, preferredTop);
  const maxLeft = Math.max(margin, viewportWidth - popWidth - margin);
  const left = Math.min(maxLeft, Math.max(margin, triggerRect.left));
  return { left, top };
}

/** Closes whichever custom color picker popover is currently open, committing any pending change. */
export function closeActiveColorPickerPopover(): void {
  activeCloseFn?.();
}

/** Renders a compact color swatch trigger button that opens createColorPicker in a floating popover. */
export function createColorPickerButton(options: ColorPickerButtonOptions): ColorPickerButtonController {
  let currentHex = normalizeHex(options.initialColor) ?? '#9ca3af';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `color-picker-trigger${options.disabled ? ' is-disabled' : ''}`;
  btn.setAttribute('aria-haspopup', 'dialog');
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-label', options.title ?? options.label ?? 'Pick color');
  if (options.title) btn.title = options.title;
  if (options.disabled) btn.disabled = true;

  const chip = document.createElement('span');
  chip.className = 'color-picker-trigger-chip';
  chip.style.backgroundColor = currentHex;
  btn.appendChild(chip);

  let popoverEl: HTMLElement | null = null;
  let pickerCtrl: ColorPickerController | null = null;
  let openedHex = currentHex;
  let dirty = false;

  let onDocPointerDown: ((e: PointerEvent) => void) | null = null;
  let onWinKeyDown: ((e: KeyboardEvent) => void) | null = null;
  let onWinReposition: ((e: Event) => void) | null = null;

  const positionPopover = (): void => {
    if (!popoverEl) return;
    if (!btn.isConnected) {
      close();
      return;
    }
    const rect = btn.getBoundingClientRect();
    if (rect.width === 0) {
      close();
      return;
    }
    const { left, top } = computePopoverPosition(
      rect,
      popoverEl.offsetWidth || 276,
      popoverEl.offsetHeight || 260,
      window.innerWidth,
      window.innerHeight
    );
    popoverEl.style.left = `${left}px`;
    popoverEl.style.top = `${top}px`;
  };

  const close = (): void => {
    if (!popoverEl) return;
    if (onDocPointerDown) document.removeEventListener('pointerdown', onDocPointerDown, true);
    if (onWinKeyDown) window.removeEventListener('keydown', onWinKeyDown, true);
    if (onWinReposition) {
      window.removeEventListener('resize', onWinReposition, true);
      window.removeEventListener('scroll', onWinReposition, true);
    }
    onDocPointerDown = null;
    onWinKeyDown = null;
    onWinReposition = null;

    popoverEl.remove();
    popoverEl = null;
    pickerCtrl = null;
    if (activeCloseFn === close) activeCloseFn = null;
    if (activeTriggerEl === btn) activeTriggerEl = null;
    btn.setAttribute('aria-expanded', 'false');

    const committedHex = currentHex;
    const shouldCommit = dirty && committedHex !== openedHex;
    dirty = false;
    if (shouldCommit) options.onCommit?.(committedHex);
  };

  const open = (): void => {
    if (options.disabled) return;
    if (activeTriggerEl === btn && popoverEl) {
      close();
      return;
    }
    closeActiveColorPickerPopover();

    openedHex = currentHex;
    dirty = false;

    const pop = document.createElement('div');
    pop.className = 'color-picker-popover';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', options.label ?? 'Color Picker');

    const picker = createColorPicker({
      initialColor: currentHex,
      swatches: options.swatches,
      label: options.label,
      onChange: (hex) => {
        currentHex = normalizeHex(hex) ?? hex;
        dirty = true;
        chip.style.backgroundColor = currentHex;
        options.onChange?.(currentHex);
      },
    });

    const footer = document.createElement('div');
    footer.className = 'color-picker-popover-footer';
    const doneBtn = document.createElement('button');
    doneBtn.type = 'button';
    doneBtn.className = 'primary';
    doneBtn.textContent = 'Done';
    doneBtn.addEventListener('click', close);
    footer.appendChild(doneBtn);

    pop.append(picker.el, footer);
    document.body.appendChild(pop);

    popoverEl = pop;
    pickerCtrl = picker;
    activeCloseFn = close;
    activeTriggerEl = btn;
    btn.setAttribute('aria-expanded', 'true');
    positionPopover();

    onDocPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (target && (pop.contains(target) || btn.contains(target))) return;
      close();
    };
    onWinKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      close();
    };
    onWinReposition = (e: Event) => {
      if (e.type === 'scroll' && e.target instanceof Node && pop.contains(e.target)) return;
      positionPopover();
    };

    document.addEventListener('pointerdown', onDocPointerDown, true);
    window.addEventListener('keydown', onWinKeyDown, true);
    window.addEventListener('resize', onWinReposition, true);
    window.addEventListener('scroll', onWinReposition, true);
  };

  if (!options.disabled) {
    btn.addEventListener('click', open);
  }

  return {
    el: btn,
    getColor: () => currentHex,
    setColor: (hex: string) => {
      const norm = normalizeHex(hex);
      if (!norm) return;
      currentHex = norm;
      chip.style.backgroundColor = currentHex;
      pickerCtrl?.setColor(currentHex);
    },
    close,
  };
}
