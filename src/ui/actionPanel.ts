import type { GameAction } from '../engine/actions';
import { formatCalendarDate } from '../engine/eventDraw';
import { canCancelMove, getActivePlayer, getAvailableDirections } from '../engine/helpers';
import type { GameState } from '../engine/types';
import { renderBankPanel } from './bankPanel';
import { renderEventPickPanel, renderEventStorePanel } from './eventPanel';
import { renderPencilPanel } from './pencilView';
import {
  renderBuyRivalPanel,
  renderBuySlotPanel,
  renderDeliverPanel,
  renderLiquidatePanel,
} from './shopPanel';

export type DispatchFn = (action: GameAction) => void;

function makeBtn(
  label: string,
  onClick: () => void,
  options: { primary?: boolean; disabled?: boolean } = {}
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = label;
  if (options.primary) btn.className = 'primary';
  if (options.disabled) btn.disabled = true;
  btn.addEventListener('click', onClick);
  return btn;
}

function appendUndoControls(
  stack: HTMLElement,
  state: GameState,
  dispatch: DispatchFn,
  isLandedPrompt = false
): void {
  const canUndo = canCancelMove(state);
  if (isLandedPrompt && !canUndo) return;

  const resetLabel = isLandedPrompt ? 'Change Route (Esc)' : 'Reset Move (Esc)';
  stack.appendChild(makeBtn('Undo Step', () => dispatch({ type: 'UNDO_STEP' }), { disabled: !canUndo }));
  stack.appendChild(makeBtn(resetLabel, () => dispatch({ type: 'CANCEL_MOVE' }), { disabled: !canUndo }));
}

export interface ActionPanelViewOptions {
  onOpenSetup?: () => void;
  readOnly?: boolean;
  remotePencilSpinning?: boolean;
  onPencilSpinChange?: (spinning: boolean) => void;
}

export function renderActionPanel(
  container: HTMLElement,
  state: GameState,
  dispatch: DispatchFn,
  viewOptionsOrSetup?: ActionPanelViewOptions | (() => void)
): void {
  const viewOptions: ActionPanelViewOptions =
    typeof viewOptionsOrSetup === 'function' ? { onOpenSetup: viewOptionsOrSetup } : (viewOptionsOrSetup ?? {});
  container.innerHTML = '';
  const active = getActivePlayer(state);

  const heading = document.createElement('h3');
  heading.className = 'panel-title';
  const dateTag = formatCalendarDate(state.month, state.year);
  const saleTag = state.globalSale
    ? ` | ${state.globalSale.label} (${Math.round((1 - state.globalSale.priceMultiplier) * 100)}% OFF)`
    : '';
  const waitTag = viewOptions.readOnly && state.phase !== 'GAME_OVER' ? ` · Waiting for ${active.name}...` : '';
  heading.textContent = `${dateTag} · Turn ${state.turnNumber} · Goal: $${state.config.targetAssets} — ${active.name} (${state.phase})${saleTag}${waitTag}`;
  container.appendChild(heading);

  const stack = document.createElement('div');
  stack.className = 'action-stack';
  container.appendChild(stack);
  renderActionPanelBody(stack, state, dispatch, viewOptions);

  if (viewOptions.readOnly && state.phase !== 'GAME_OVER') {
    for (const el of Array.from(stack.querySelectorAll<HTMLButtonElement | HTMLSelectElement | HTMLInputElement>('button, select, input'))) {
      el.disabled = true;
    }
  }
}

function renderActionPanelBody(
  stack: HTMLElement,
  state: GameState,
  dispatch: DispatchFn,
  viewOptions: ActionPanelViewOptions
): void {
  const active = getActivePlayer(state);

  if (state.phase === 'ROLL_PENCIL') {
    renderPencilPanel(stack, state, dispatch, {
      readOnly: viewOptions.readOnly,
      remoteSpinning: viewOptions.remotePencilSpinning,
      onSpinChange: viewOptions.onPencilSpinChange,
    });
    return;
  }

  if (state.phase === 'CHOOSE_DIRECTION') {
    const dirs = getAvailableDirections(state, active);
    const info = document.createElement('span');
    info.textContent = `Steps left: ${state.remainingSteps}. Choose direction:`;
    stack.appendChild(info);

    for (const dir of dirs) {
      stack.appendChild(
        makeBtn(dir.toUpperCase(), () => dispatch({ type: 'CHOOSE_DIRECTION', direction: dir }), {
          primary: true,
        })
      );
    }
    appendUndoControls(stack, state, dispatch);
    return;
  }

  if (state.phase === 'STEPPING') {
    stack.appendChild(
      makeBtn(`Step (${state.remainingSteps} left)`, () => dispatch({ type: 'ADVANCE_STEP' }), {
        primary: true,
      })
    );
    appendUndoControls(stack, state, dispatch);
    return;
  }

  if (state.phase === 'ESCALATOR_RIDE' || state.phase === 'ESCALATOR_UNDO') {
    const note = document.createElement('span');
    note.textContent = state.phase === 'ESCALATOR_UNDO' ? 'Reversing escalator...' : 'Riding escalator...';
    stack.appendChild(note);
    return;
  }

  if (state.phase === 'ELEVATOR_PROMPT') {
    const info = document.createElement('span');
    info.textContent = 'Ride the Elevator to a random floor?';
    stack.appendChild(info);
    stack.appendChild(
      makeBtn('Ride Elevator', () => dispatch({ type: 'RESOLVE_ELEVATOR', ride: true }), {
        primary: true,
      })
    );
    stack.appendChild(
      makeBtn('Stay Here', () => dispatch({ type: 'RESOLVE_ELEVATOR', ride: false }))
    );
    appendUndoControls(stack, state, dispatch, true);
    return;
  }

  if (state.phase === 'EVENT_PICK') {
    renderEventPickPanel(stack, state, dispatch);
    return;
  }

  if (state.phase === 'EVENT_PICK_STORE') {
    renderEventStorePanel(stack, state, dispatch);
    return;
  }

  if (state.phase === 'BANK_MENU') {
    renderBankPanel(stack, state, dispatch);
    return;
  }

  if (state.phase === 'SHOP_BUY_SLOT') {
    renderBuySlotPanel(stack, state, dispatch);
    appendUndoControls(stack, state, dispatch, true);
    return;
  }

  if (state.phase === 'SHOP_DELIVER') {
    renderDeliverPanel(stack, state, dispatch);
    appendUndoControls(stack, state, dispatch, true);
    return;
  }

  if (state.phase === 'SHOP_BUY_RIVAL') {
    renderBuyRivalPanel(stack, state, dispatch);
    appendUndoControls(stack, state, dispatch, true);
    return;
  }

  if (state.phase === 'LIQUIDATE_ASSETS') {
    renderLiquidatePanel(stack, state, dispatch);
    return;
  }

  if (state.phase === 'GAME_OVER') {
    const winner = state.players.find((p) => p.id === state.winnerId);
    const msg = document.createElement('strong');
    msg.textContent = `Winner: ${winner?.name ?? 'Unknown'}!`;
    stack.appendChild(msg);
    if (viewOptions.onOpenSetup) {
      stack.appendChild(makeBtn('Match Setup / New Match', viewOptions.onOpenSetup, { primary: true }));
    }
  }
}