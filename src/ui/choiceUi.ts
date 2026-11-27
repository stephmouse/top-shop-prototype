export interface ChoiceButtonOptions {
  hotkey?: number;
  shopId?: string;
  onHoverShop?: (shopId: string | null) => void;
  confirm?: boolean;
  back?: boolean;
  skip?: boolean;
  nav?: boolean;
  accentColor?: string;
  primary?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * Applies choice UI metadata (keycap hotkey badge, hover-to-board wiring, confirm/back/skip/nav tags)
 * to an existing button element.
 */
export function decorateChoiceButton(
  btn: HTMLButtonElement,
  options: Omit<ChoiceButtonOptions, 'primary' | 'disabled' | 'className'> = {}
): void {
  if (options.hotkey !== undefined && options.hotkey >= 1 && options.hotkey <= 9) {
    btn.dataset.hotkey = String(options.hotkey);
    const keycap = document.createElement('span');
    keycap.className = 'choice-keycap';
    keycap.textContent = String(options.hotkey);
    btn.prepend(keycap);
  } else if (options.skip) {
    const keycap = document.createElement('span');
    keycap.className = 'choice-keycap choice-keycap--wide';
    keycap.textContent = '0/S';
    btn.prepend(keycap);
  }
  if (options.shopId) {
    btn.dataset.shopId = options.shopId;
  }
  if (options.confirm) {
    btn.dataset.choiceConfirm = 'true';
  }
  if (options.back) {
    btn.dataset.choiceBack = 'true';
  }
  if (options.skip) {
    btn.dataset.choiceSkip = 'true';
  }
  if (options.nav) {
    btn.dataset.choiceNav = 'true';
  }
  if (options.accentColor) {
    btn.style.borderLeft = `4px solid ${options.accentColor}`;
  }
  if (options.shopId && options.onHoverShop) {
    const { shopId, onHoverShop } = options;
    btn.addEventListener('mouseenter', () => onHoverShop(shopId));
    btn.addEventListener('mouseleave', () => onHoverShop(null));
    btn.addEventListener('focus', () => onHoverShop(shopId));
    btn.addEventListener('blur', () => onHoverShop(null));
  }
}

/** Creates a styled choice button with optional keycap badge and board-hover wiring. */
export function createChoiceButton(
  label: string,
  onClick: () => void,
  options: ChoiceButtonOptions = {}
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  const classes = ['choice-btn', options.primary ? 'primary' : '', options.className ?? ''].filter(
    Boolean
  );
  btn.className = classes.join(' ');
  if (options.disabled) btn.disabled = true;

  const labelEl = document.createElement('span');
  labelEl.className = 'choice-btn-label';
  labelEl.textContent = label;
  btn.appendChild(labelEl);

  decorateChoiceButton(btn, options);
  btn.addEventListener('click', onClick);
  return btn;
}

/** Creates a consistent top header bar for Back / Skip / Cancel controls and an optional prompt. */
export function makeChoiceHeaderRow(
  controls: HTMLElement[],
  promptText?: string
): { headerRow: HTMLElement; promptEl?: HTMLElement } {
  const headerRow = document.createElement('div');
  headerRow.className = 'choice-header-row';
  for (const ctrl of controls) headerRow.appendChild(ctrl);

  if (!promptText) return { headerRow };
  const promptEl = document.createElement('div');
  promptEl.className = 'choice-prompt';
  promptEl.textContent = promptText;
  return { headerRow, promptEl };
}

/** Toggles `.is-board-hovered` on panel buttons whose `data-shop-id` matches the hovered board tile. */
export function syncBoardHoverHighlight(actionBox: HTMLElement, shopId: string | null): void {
  for (const el of Array.from(actionBox.querySelectorAll<HTMLElement>('[data-shop-id]'))) {
    el.classList.toggle('is-board-hovered', Boolean(shopId && el.dataset.shopId === shopId));
  }
}
