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
import { createChoiceButton } from './choiceUi';

type DispatchFn = (action: GameAction) => void;

function mkStyleSelect(initial: WalkSoundStyle): HTMLSelectElement {
  const sel = document.createElement('select');
  sel.className = 'setup-select';
  for (const s of WALK_SOUND_STYLES) {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = WALK_SOUND_META[s].label;
    sel.appendChild(opt);
  }
  sel.value = initial;
  return sel;
}

export function renderShoesChoicePanel(
  container: HTMLElement,
  state: GameState,
  dispatch: DispatchFn,
  onPreviewWalkSound?: (choice: WalkSoundChoice) => void
): void {
  const active = getActivePlayer(state);
  const current = getPlayerWalkSounds(active);
  const root = document.createElement('div');
  root.className = 'card-list';

  const summary = document.createElement('div');
  summary.textContent =
    current.length > 0
      ? `Wearing (${current.length}/${MAX_WALK_SOUND_LAYERS}): ${current
          .map((s, i) => `L${i + 1}: ${WALK_SOUND_META[s].label}`)
          .join(' + ')}`
      : 'No novelty shoes equipped.';
  root.appendChild(summary);

  const defaultNew =
    WALK_SOUND_STYLES.find((s) => !current.includes(s)) ?? WALK_SOUND_STYLES[0]!;
  let hotkey = 1;

  if (current.length < MAX_WALK_SOUND_LAYERS) {
    const stackRow = document.createElement('div');
    stackRow.className = 'action-stack';
    const stackSel = mkStyleSelect(defaultNew);
    const testBtn = document.createElement('button');
    testBtn.textContent = '🔊 Test';
    testBtn.addEventListener('click', () => onPreviewWalkSound?.(stackSel.value as WalkSoundStyle));
    const stackBtn = createChoiceButton(
      `Stack Pair (Layer ${current.length + 1})`,
      () => dispatch({ type: 'RESOLVE_SHOES', mode: 'stack', style: stackSel.value as WalkSoundStyle }),
      { hotkey: hotkey++, primary: true, confirm: true }
    );
    stackRow.append(stackSel, testBtn, stackBtn);
    root.appendChild(stackRow);
  }

  if (current.length > 0) {
    const swapRow = document.createElement('div');
    swapRow.className = 'action-stack';
    const layerSel = document.createElement('select');
    layerSel.className = 'setup-select';
    current.forEach((s, idx) => {
      const opt = document.createElement('option');
      opt.value = String(idx);
      opt.textContent = `Layer ${idx + 1} (${WALK_SOUND_META[s].shortChip})`;
      layerSel.appendChild(opt);
    });
    const swapStyleSel = mkStyleSelect(defaultNew);
    const testSwapBtn = document.createElement('button');
    testSwapBtn.textContent = '🔊 Test';
    testSwapBtn.addEventListener('click', () =>
      onPreviewWalkSound?.(swapStyleSel.value as WalkSoundStyle)
    );
    const swapBtn = createChoiceButton(
      'Swap Layer',
      () =>
        dispatch({
          type: 'RESOLVE_SHOES',
          mode: 'replace',
          slotIndex: Number(layerSel.value) || 0,
          style: swapStyleSel.value as WalkSoundStyle,
        }),
      { hotkey: hotkey++ }
    );
    swapRow.append(layerSel, swapStyleSel, testSwapBtn, swapBtn);
    root.appendChild(swapRow);
  }

  const actionsRow = document.createElement('div');
  actionsRow.className = 'action-stack';
  const keepPrimary = current.length >= MAX_WALK_SOUND_LAYERS;
  const keepBtn = createChoiceButton(
    'Keep Current Shoes',
    () => dispatch({ type: 'RESOLVE_SHOES', mode: 'keep' }),
    { hotkey: hotkey++, primary: keepPrimary, confirm: keepPrimary }
  );
  actionsRow.appendChild(keepBtn);

  if (current.length > 0) {
    const clearBtn = createChoiceButton(
      current.length > 1 ? 'Take Off All Shoes' : 'Take Off Shoes',
      () => dispatch({ type: 'RESOLVE_SHOES', mode: 'clear' }),
      { hotkey: hotkey++ }
    );
    actionsRow.appendChild(clearBtn);
  }

  root.appendChild(actionsRow);
  container.appendChild(root);
}
