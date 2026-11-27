import {
  getPlayerWalkSounds,
  MAX_WALK_SOUND_LAYERS,
  WALK_SOUND_META,
  WALK_SOUND_STYLES,
} from '../config/walkSounds';
import type { WalkSoundChoice, WalkSoundStyle } from '../config/walkSounds';
import type { GameAction } from '../engine/actions';
import { getActivePlayer } from '../engine/helpers';
import type { GameState } from '../engine/types';
import { createChoiceButton, makeChoiceHeaderRow } from './choiceUi';

type DispatchFn = (action: GameAction) => void;

function mkStyleSelect(initial: WalkSoundStyle, ariaLabel: string): HTMLSelectElement {
  const sel = document.createElement('select');
  sel.className = 'setup-select';
  sel.setAttribute('aria-label', ariaLabel);
  for (const s of WALK_SOUND_STYLES) {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = WALK_SOUND_META[s].label;
    sel.appendChild(opt);
  }
  sel.value = initial;
  return sel;
}

function mkTestButton(getStyle: () => WalkSoundStyle, onPreviewWalkSound?: (choice: WalkSoundChoice) => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = '🔊 Test';
  btn.addEventListener('click', () => onPreviewWalkSound?.(getStyle()));
  return btn;
}

function buildSlotsStrip(
  current: WalkSoundStyle[],
  onPreviewWalkSound?: (choice: WalkSoundChoice) => void
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'shoes-slots-row';

  for (let i = 0; i < MAX_WALK_SOUND_LAYERS; i++) {
    const equipped = current[i];
    const isNextOpen = !equipped && i === current.length;
    const card = document.createElement('div');
    card.className = equipped
      ? 'shoes-slot-card is-filled'
      : `shoes-slot-card is-empty${isNextOpen ? ' is-next' : ''}`;

    const meta = document.createElement('div');
    meta.className = 'shoes-slot-meta';
    const indexEl = document.createElement('span');
    indexEl.className = 'shoes-slot-index';
    indexEl.textContent = `Slot ${i + 1}`;
    const nameEl = document.createElement('span');
    nameEl.className = 'shoes-slot-name';
    nameEl.textContent = equipped
      ? WALK_SOUND_META[equipped].label
      : isNextOpen
        ? 'Open for stacking'
        : 'Empty';
    meta.append(indexEl, nameEl);
    card.appendChild(meta);

    if (equipped) {
      const previewBtn = document.createElement('button');
      previewBtn.type = 'button';
      previewBtn.className = 'shoes-slot-preview';
      previewBtn.textContent = '🔊';
      previewBtn.title = `Preview Slot ${i + 1} (${WALK_SOUND_META[equipped].label})`;
      previewBtn.setAttribute('aria-label', `Preview Slot ${i + 1}`);
      previewBtn.addEventListener('click', () => onPreviewWalkSound?.(equipped));
      card.appendChild(previewBtn);
    }

    row.appendChild(card);
  }

  return row;
}

export function renderShoesChoicePanel(
  container: HTMLElement,
  state: GameState,
  dispatch: DispatchFn,
  onPreviewWalkSound?: (choice: WalkSoundChoice) => void
): void {
  const active = getActivePlayer(state);
  const current = getPlayerWalkSounds(active);
  const canStack = current.length < MAX_WALK_SOUND_LAYERS;
  const hasEquipped = current.length > 0;
  const atCap = !canStack;

  const root = document.createElement('div');
  root.className = 'shoes-panel';

  const headerControls: HTMLElement[] = [
    createChoiceButton('Keep Current Shoes', () => dispatch({ type: 'RESOLVE_SHOES', mode: 'keep' }), {
      skip: true,
      primary: !hasEquipped,
      confirm: !hasEquipped,
    }),
  ];
  if (hasEquipped) {
    headerControls.push(
      createChoiceButton(
        current.length > 1 ? 'Take Off All Shoes' : 'Take Off Shoes',
        () => dispatch({ type: 'RESOLVE_SHOES', mode: 'clear' }),
        { className: 'shoes-clear-btn' }
      )
    );
  }
  const promptText = canStack
    ? 'Choose ONE option below (takes effect immediately):'
    : 'All 3 shoe slots are full — choose ONE option below:';
  const { headerRow } = makeChoiceHeaderRow(headerControls, promptText);
  root.appendChild(headerRow);

  root.appendChild(buildSlotsStrip(current, onPreviewWalkSound));

  const defaultNew = WALK_SOUND_STYLES.find((s) => !current.includes(s)) ?? WALK_SOUND_STYLES[0]!;
  let hotkey = 1;

  const optionsGrid = document.createElement('div');
  optionsGrid.className = `shoes-options-grid${canStack && hasEquipped ? '' : ' is-single'}`;

  if (canStack) {
    const stackCard = document.createElement('div');
    stackCard.className = 'shoes-option-card is-primary';

    const head = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'shoes-option-title';
    title.textContent = `Add New Layer · Slot ${current.length + 1} of ${MAX_WALK_SOUND_LAYERS}`;
    const desc = document.createElement('div');
    desc.className = 'shoes-option-desc';
    desc.textContent = 'Layers another staggered walk sound alongside your equipped shoes.';
    head.append(title, desc);

    const stackSel = mkStyleSelect(defaultNew, 'Sound style to stack');
    const controls = document.createElement('div');
    controls.className = 'shoes-option-controls';
    controls.append(stackSel, mkTestButton(() => stackSel.value as WalkSoundStyle, onPreviewWalkSound));

    const stackBtn = createChoiceButton(
      `Add to Slot ${current.length + 1}`,
      () => dispatch({ type: 'RESOLVE_SHOES', mode: 'stack', style: stackSel.value as WalkSoundStyle }),
      { hotkey: hotkey++, primary: true, confirm: true }
    );

    stackCard.append(head, controls, stackBtn);
    optionsGrid.appendChild(stackCard);
  }

  if (canStack && hasEquipped) {
    const orDivider = document.createElement('div');
    orDivider.className = 'shoes-or-divider';
    orDivider.textContent = 'OR';
    optionsGrid.appendChild(orDivider);
  }

  if (hasEquipped) {
    const swapCard = document.createElement('div');
    swapCard.className = `shoes-option-card${atCap ? ' is-primary' : ''}`;

    const head = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'shoes-option-title';
    title.textContent = 'Replace an Existing Slot';
    const desc = document.createElement('div');
    desc.className = 'shoes-option-desc';
    desc.textContent = 'Swaps one worn pair without adding a new layer.';
    head.append(title, desc);

    const controls = document.createElement('div');
    controls.className = 'shoes-option-controls';

    let getSlotIndex = () => 0;
    let layerSel: HTMLSelectElement | null = null;
    if (current.length > 1) {
      layerSel = document.createElement('select');
      layerSel.className = 'setup-select';
      layerSel.setAttribute('aria-label', 'Shoe slot to replace');
      current.forEach((s, idx) => {
        const opt = document.createElement('option');
        opt.value = String(idx);
        opt.textContent = `Slot ${idx + 1}: ${WALK_SOUND_META[s].shortChip}`;
        layerSel!.appendChild(opt);
      });
      getSlotIndex = () => Number(layerSel!.value) || 0;
      const arrow = document.createElement('span');
      arrow.className = 'shoes-arrow';
      arrow.textContent = '→';
      controls.append(layerSel, arrow);
    } else {
      const staticSlot = document.createElement('span');
      staticSlot.className = 'shoes-slot-static';
      staticSlot.textContent = `Slot 1 (${WALK_SOUND_META[current[0]!].shortChip}) →`;
      controls.appendChild(staticSlot);
    }

    const swapStyleSel = mkStyleSelect(defaultNew, 'Replacement sound style');
    controls.append(swapStyleSel, mkTestButton(() => swapStyleSel.value as WalkSoundStyle, onPreviewWalkSound));

    const swapBtn = createChoiceButton(
      'Replace Slot 1',
      () =>
        dispatch({
          type: 'RESOLVE_SHOES',
          mode: 'replace',
          slotIndex: getSlotIndex(),
          style: swapStyleSel.value as WalkSoundStyle,
        }),
      { hotkey: hotkey++, primary: atCap, confirm: atCap }
    );

    if (layerSel) {
      layerSel.addEventListener('change', () => {
        const labelEl = swapBtn.querySelector('.choice-btn-label');
        if (labelEl) labelEl.textContent = `Replace Slot ${getSlotIndex() + 1}`;
      });
    }

    swapCard.append(head, controls, swapBtn);
    optionsGrid.appendChild(swapCard);
  }

  root.appendChild(optionsGrid);
  container.appendChild(root);
}
