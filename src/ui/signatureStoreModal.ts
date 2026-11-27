import {
  DEFAULT_SIGNATURE_ACCENT,
  sanitizeSignatureStore,
  SIGNATURE_ICON_IDS,
  SIGNATURE_ITEM_MAX_LEN,
  SIGNATURE_NAME_MAX_LEN,
  SIGNATURE_PRESET_IDEAS,
} from '../config/signatureStore';
import type { SignatureStoreSpec } from '../config/signatureStore';
import type { StoreIconId } from '../config/storeVisuals';
import { addLobbySection, mk, mkBtn } from './lobbyRoomView';
import { createStoreIconSvg } from './storeTileView';

export interface SignatureStoreModalController {
  el: HTMLElement;
  open: (
    current: SignatureStoreSpec | undefined,
    playerColor: string,
    title: string,
    onSave: (next: SignatureStoreSpec | undefined) => void
  ) => void;
  close: () => void;
  isOpen: () => boolean;
}

const ACCENT_SWATCHES = ['#facc15', '#38bdf8', '#f472b6', '#4ade80', '#fb923c', '#c084fc', '#f87171', '#f8fafc'];

const ITEM_SLOT_LABELS = [
  'Item 1 (L1 Starter)',
  'Item 2 (L1 Starter)',
  'Item 3 (L1 Starter)',
  'Item 4 (L2 Chain)',
  'Item 5 (L3 Chain)',
  'Item 6 (L4 Flagship)',
];

/** Creates the modal dialog for customizing a player's 1-per-player Signature Store. */
export function createSignatureStoreModal(): SignatureStoreModalController {
  let visible = false;
  let ownerColor = '#58a6ff';
  let modalTitle = 'Customize Signature Store';
  let saveCb: ((next: SignatureStoreSpec | undefined) => void) | null = null;

  let draftName = '';
  let draftIcon: StoreIconId = 'sparkles';
  let draftAccent = DEFAULT_SIGNATURE_ACCENT;
  let draftItems: [string, string, string, string, string, string] = ['', '', '', '', '', ''];
  let ideaIndex = 0;

  const backdrop = Object.assign(mk('div', 'setup-backdrop signature-backdrop'), { hidden: true });
  const modal = mk('div', 'setup-modal signature-modal');
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  backdrop.appendChild(modal);

  const close = () => {
    visible = false;
    backdrop.hidden = true;
    saveCb = null;
  };
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  function render(): void {
    modal.innerHTML = '';

    const header = mk('div', 'setup-header');
    header.append(mk('h2', 'setup-title', `★ ${modalTitle}`), mkBtn('Close (Esc)', close));

    const body = mk('div', 'lobby-body signature-body');
    const note = mk(
      'div',
      'setup-muted',
      'Appears as an optional 4th choice when claiming a section’s top-value lot (1 section at a time). Shares real PS1 prices & rules.'
    );

    // Live Mini Preview Tile
    const previewTile = mk('div', 'signature-preview-card');
    previewTile.style.setProperty('--owner-color', ownerColor);
    previewTile.style.borderBottom = `4px solid ${ownerColor}`;
    const awning = mk('div', 'tile-awning');
    const prevHead = mk('div', 'signature-preview-head');
    const iconBox = mk('span', 'tile-icon');
    const nameEl = mk('span', 'signature-preview-name');
    const prevSub = mk('div', 'setup-muted signature-preview-sub');

    const syncPreview = () => {
      iconBox.innerHTML = '';
      iconBox.style.color = draftAccent;
      iconBox.appendChild(createStoreIconSvg(draftIcon));
      nameEl.textContent = draftName.trim() ? `★ ${draftName.trim()}` : '★ (Not Named Yet — Disabled)';
      const firstCustom = draftItems.find((s) => s.trim())?.trim();
      prevSub.textContent = firstCustom
        ? `Featured item: ${firstCustom} · Chain L1–L4`
        : 'Leave blank to disable Signature Store · Blank item slots use standard PS1 names';
    };
    prevHead.append(iconBox, nameEl);
    previewTile.append(awning, prevHead, prevSub);

    // Identity & Accent Section
    const identitySec = addLobbySection('Store Name & Icon');
    const topRow = mk('div', 'setup-row-between signature-name-row');
    const nameInput = Object.assign(mk('input', 'setup-input'), {
      type: 'text',
      maxLength: SIGNATURE_NAME_MAX_LEN,
      value: draftName,
      placeholder: 'e.g. Starlight Emporium',
    });
    nameInput.addEventListener('input', () => {
      draftName = nameInput.value;
      syncPreview();
    });

    const randomBtn = mkBtn('🎲 Random Idea', () => {
      const idea = SIGNATURE_PRESET_IDEAS[ideaIndex % SIGNATURE_PRESET_IDEAS.length]!;
      ideaIndex++;
      draftName = idea.name;
      draftIcon = idea.iconId;
      draftAccent = idea.accent;
      draftItems = [...idea.itemNames];
      render();
    });
    topRow.append(nameInput, randomBtn);

    const iconGrid = mk('div', 'signature-icon-grid');
    for (const iconId of SIGNATURE_ICON_IDS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `signature-icon-btn${draftIcon === iconId ? ' is-active' : ''}`;
      btn.title = iconId;
      btn.appendChild(createStoreIconSvg(iconId));
      btn.addEventListener('click', () => {
        draftIcon = iconId;
        for (const el of Array.from(iconGrid.children)) el.classList.remove('is-active');
        btn.classList.add('is-active');
        syncPreview();
      });
      iconGrid.appendChild(btn);
    }

    const accentRow = mk('div', 'signature-accent-row');
    accentRow.appendChild(mk('span', 'setup-field-label', 'Emblem Accent:'));
    const colorInput = Object.assign(mk('input', 'setup-color-picker'), {
      type: 'color',
      value: draftAccent,
    });
    const swatchesWrap = mk('div', 'setup-swatches');
    const syncSwatches = () => {
      colorInput.value = draftAccent;
      for (const btn of Array.from(swatchesWrap.children) as HTMLElement[]) {
        btn.classList.toggle('is-selected', btn.title.toLowerCase() === draftAccent.toLowerCase());
      }
      syncPreview();
    };
    colorInput.addEventListener('input', () => {
      draftAccent = colorInput.value;
      syncSwatches();
    });
    for (const hex of ACCENT_SWATCHES) {
      const sw = Object.assign(mk('button', 'color-swatch'), { type: 'button' as const, title: hex });
      sw.style.backgroundColor = hex;
      sw.addEventListener('click', () => {
        draftAccent = hex;
        syncSwatches();
      });
      swatchesWrap.appendChild(sw);
    }
    accentRow.append(colorInput, swatchesWrap);
    identitySec.append(topRow, iconGrid, accentRow);

    // 6 Item Names
    const itemsSec = addLobbySection('Custom Item Names (6 Slots)');
    const itemsGrid = mk('div', 'signature-items-grid');
    for (let i = 0; i < 6; i++) {
      const field = mk('label', 'setup-field');
      const input = Object.assign(mk('input', 'setup-input'), {
        type: 'text',
        maxLength: SIGNATURE_ITEM_MAX_LEN,
        value: draftItems[i] ?? '',
        placeholder: `Optional (uses store item #${i + 1})`,
      });
      const slotIdx = i;
      input.addEventListener('input', () => {
        draftItems[slotIdx] = input.value;
        syncPreview();
      });
      field.append(mk('span', 'setup-field-label', ITEM_SLOT_LABELS[i]!), input);
      itemsGrid.appendChild(field);
    }
    itemsSec.appendChild(itemsGrid);

    syncSwatches();
    body.append(note, previewTile, identitySec, itemsSec);

    const footer = mk('div', 'setup-footer');
    const leftBtns = mk('div', 'setup-btn-row');
    leftBtns.append(
      mkBtn('Clear / Disable', () => {
        const cb = saveCb;
        close();
        cb?.(undefined);
      })
    );
    const rightBtns = mk('div', 'setup-btn-row');
    rightBtns.append(
      mkBtn('Cancel', close),
      mkBtn(
        'Save Signature Store',
        () => {
          const sanitized = sanitizeSignatureStore({
            name: draftName,
            iconId: draftIcon,
            accent: draftAccent,
            itemNames: draftItems,
          });
          const cb = saveCb;
          close();
          cb?.(sanitized);
        },
        'primary'
      )
    );
    footer.append(leftBtns, rightBtns);
    modal.append(header, body, footer);
  }

  return {
    el: backdrop,
    open: (current, color, title, onSave) => {
      ownerColor = color || '#58a6ff';
      modalTitle = title || 'Customize Signature Store';
      saveCb = onSave;
      const clean = sanitizeSignatureStore(current);
      draftName = clean?.name ?? '';
      draftIcon = clean?.iconId ?? 'sparkles';
      draftAccent = clean?.accent ?? DEFAULT_SIGNATURE_ACCENT;
      draftItems = clean ? [...clean.itemNames] : ['', '', '', '', '', ''];
      visible = true;
      render();
      backdrop.hidden = false;
    },
    close,
    isOpen: () => visible,
  };
}
