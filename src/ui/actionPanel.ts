import type { SignatureStoreSpec } from '../config/signatureStore';
import type { WalkSoundChoice } from '../config/walkSounds';
import type { GameAction } from '../engine/actions';
import { formatCalendarDate } from '../engine/eventDraw';
import { canCancelMove, getActivePlayer, getAvailableDirections } from '../engine/helpers';
import { formatTimedWindowEndpoint, getTimedWindowRoundsLeft } from '../engine/timedEffects';
import { getWinnerIds } from '../engine/turn';
import type { GameState, PencilFace } from '../engine/types';
import { renderBankPanel } from './bankPanel';
import { createChoiceButton } from './choiceUi';
import { renderEventPickPanel, renderEventStorePanel } from './eventPanel';
import { setMoneyText } from './moneyText';
import { cancelPencilAnimation, renderPencilPanel } from './pencilView';
import { getDisplayPlayerColor } from './themeConfig';
import { renderShoesChoicePanel } from './shoesPanel';
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
  options: { primary?: boolean; disabled?: boolean; className?: string } = {}
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = label;
  const classes = [options.primary ? 'primary' : '', options.className ?? ''].filter(Boolean);
  if (classes.length > 0) btn.className = classes.join(' ');
  if (options.disabled) btn.disabled = true;
  btn.addEventListener('click', onClick);
  return btn;
}

function renderMovementBar(stack: HTMLElement, state: GameState, dispatch: DispatchFn): void {
  const active = getActivePlayer(state);
  const dirs = getAvailableDirections(state, active);
  const canUndo = canCancelMove(state);
  const isEsc = state.phase === 'ESCALATOR_RIDE' || state.phase === 'ESCALATOR_UNDO';
  const isVerticalFork =
    state.phase === 'CHOOSE_DIRECTION' && (dirs.includes('up') || dirs.includes('down'));

  const bar = Object.assign(document.createElement('div'), { className: 'move-control-bar' });
  const pill = Object.assign(document.createElement('span'), {
    className: 'move-steps-pill',
    textContent: `${state.remainingSteps} to go`,
  });
  const pair = Object.assign(document.createElement('div'), { className: 'move-dir-pair' });
  const actions = Object.assign(document.createElement('div'), { className: 'move-bar-actions' });

  if (isVerticalFork) {
    pair.append(
      makeBtn('↑ Up', () => dispatch({ type: 'CHOOSE_DIRECTION', direction: 'up' }), {
        primary: true,
        disabled: !dirs.includes('up'),
        className: 'move-dir-btn',
      }),
      makeBtn('↓ Down', () => dispatch({ type: 'CHOOSE_DIRECTION', direction: 'down' }), {
        primary: true,
        disabled: !dirs.includes('down'),
        className: 'move-dir-btn',
      })
    );
    actions.appendChild(makeBtn('Undo Step', () => dispatch({ type: 'UNDO_STEP' }), { disabled: !canUndo }));
  } else if (state.phase === 'CHOOSE_DIRECTION') {
    pair.append(
      makeBtn('← Left', () => dispatch({ type: 'CHOOSE_DIRECTION', direction: 'left' }), {
        primary: true,
        disabled: !dirs.includes('left'),
        className: 'move-dir-btn',
      }),
      makeBtn('→ Right', () => dispatch({ type: 'CHOOSE_DIRECTION', direction: 'right' }), {
        primary: true,
        disabled: !dirs.includes('right'),
        className: 'move-dir-btn',
      })
    );
  } else if (state.phase === 'STEPPING') {
    const forwardDir = active.horizontalDir ?? (state.tiles[active.tileId]?.neighbors.right ? 'right' : 'left');
    if (forwardDir === 'left') {
      pair.append(
        makeBtn('← Left', () => dispatch({ type: 'ADVANCE_STEP' }), { primary: true, className: 'move-dir-btn' }),
        makeBtn('→ Back', () => dispatch({ type: 'UNDO_STEP' }), { disabled: !canUndo, className: 'move-dir-btn' })
      );
    } else {
      pair.append(
        makeBtn('← Back', () => dispatch({ type: 'UNDO_STEP' }), { disabled: !canUndo, className: 'move-dir-btn' }),
        makeBtn('→ Right', () => dispatch({ type: 'ADVANCE_STEP' }), { primary: true, className: 'move-dir-btn' })
      );
    }
  } else {
    pair.append(
      makeBtn('← Left', () => {}, {
        primary: active.horizontalDir === 'left',
        disabled: true,
        className: 'move-dir-btn',
      }),
      makeBtn('→ Right', () => {}, {
        primary: active.horizontalDir === 'right',
        disabled: true,
        className: 'move-dir-btn',
      })
    );
    actions.appendChild(
      Object.assign(document.createElement('span'), {
        className: 'move-esc-note',
        textContent: state.phase === 'ESCALATOR_UNDO' ? 'Reversing escalator…' : 'Riding escalator…',
      })
    );
  }

  actions.appendChild(
    makeBtn('Reset Move (Esc)', () => dispatch({ type: 'CANCEL_MOVE' }), { disabled: !canUndo || isEsc })
  );
  bar.append(pill, pair, actions);
  stack.appendChild(bar);
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
  onOpenVictory?: () => void;
  readOnly?: boolean;
  reconnecting?: boolean;
  syncedSignatures?: Readonly<Record<string, SignatureStoreSpec>>;
  remotePencilSpinning?: boolean;
  remotePencilStopFace?: PencilFace | null;
  onPencilSpinChange?: (spinning: boolean, stopFace?: PencilFace) => void;
  onPencilTick?: (isSlow: boolean, speedNorm: number) => void;
  onPencilLanded?: (face: PencilFace) => void;
  onUiChange?: () => void;
  onHoverShop?: (shopId: string | null) => void;
  onPreviewWalkSound?: (choice: WalkSoundChoice) => void;
  onPingTurn?: () => { ok: boolean; waitSec?: number };
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
  const saleRd = state.globalSale ? getTimedWindowRoundsLeft(state, state.globalSale.timer) : 0;
  const saleTag = state.globalSale
    ? ` | ${state.globalSale.label} (${Math.round((1 - state.globalSale.priceMultiplier) * 100)}% OFF · ${saleRd} rd)`
    : '';
  if (state.globalSale) {
    heading.title = formatTimedWindowEndpoint(state, state.globalSale.timer, `${state.globalSale.label} ends`);
  }
  const waitTag = viewOptions.reconnecting
    ? ' · Reconnecting to host…'
    : viewOptions.readOnly && state.phase !== 'GAME_OVER'
      ? ` · Waiting for ${active.name}...`
      : '';
  const headingText = `${dateTag} · Turn ${state.turnNumber} · Goal: $${state.config.targetAssets} — ${active.name} (${state.phase})${saleTag}${waitTag}`;
  const activeColor = getDisplayPlayerColor(state.activePlayerIndex, active.color);
  if (!viewOptions.readOnly && state.phase !== 'GAME_OVER') {
    const turnBadge = document.createElement('span');
    turnBadge.className = 'turn-cue-badge';
    turnBadge.style.borderColor = activeColor;
    turnBadge.style.color = activeColor;
    turnBadge.textContent = 'YOUR TURN';
    const textSpan = document.createElement('span');
    setMoneyText(textSpan, headingText, 'asset');
    heading.append(turnBadge, textSpan);
  } else {
    setMoneyText(heading, headingText, 'asset');
  }
  container.appendChild(heading);

  if (viewOptions.reconnecting) {
    const notice = document.createElement('div');
    notice.className = 'net-reconnect-banner';
    notice.textContent = 'Connection lost — reconnecting to host…';
    container.appendChild(notice);
  }

  if (viewOptions.readOnly && state.phase !== 'GAME_OVER' && !viewOptions.reconnecting && viewOptions.onPingTurn) {
    const pingRow = document.createElement('div');
    pingRow.className = 'turn-ping-row';
    const pingBtn = document.createElement('button');
    pingBtn.type = 'button';
    pingBtn.className = 'turn-ping-btn';
    pingBtn.textContent = `🔔 Ping ${active.name}`;
    const noteEl = document.createElement('span');
    noteEl.className = 'setup-muted';
    let clearTimer: number | null = null;
    pingBtn.addEventListener('click', () => {
      const res = viewOptions.onPingTurn!();
      if (clearTimer !== null) window.clearTimeout(clearTimer);
      noteEl.textContent = res.ok
        ? `Sent reminder to ${active.name}!`
        : res.waitSec
          ? `Cooldown (${res.waitSec}s)`
          : 'Ping unavailable';
      clearTimer = window.setTimeout(() => {
        noteEl.textContent = '';
        clearTimer = null;
      }, 1800);
    });
    pingRow.append(pingBtn, noteEl);
    container.appendChild(pingRow);
  }

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
      remoteStopFace: viewOptions.remotePencilStopFace,
      onSpinChange: viewOptions.onPencilSpinChange,
      onTick: viewOptions.onPencilTick,
      onLanded: viewOptions.onPencilLanded,
    });
    return;
  }
  cancelPencilAnimation();

  if (
    state.phase === 'CHOOSE_DIRECTION' ||
    state.phase === 'STEPPING' ||
    state.phase === 'ESCALATOR_RIDE' ||
    state.phase === 'ESCALATOR_UNDO'
  ) {
    renderMovementBar(stack, state, dispatch);
    return;
  }

  if (state.phase === 'ELEVATOR_PROMPT') {
    const info = document.createElement('span');
    info.textContent = 'Ride the Elevator to a random floor?';
    stack.appendChild(info);
    stack.appendChild(
      createChoiceButton('Ride Elevator', () => dispatch({ type: 'RESOLVE_ELEVATOR', ride: true }), {
        hotkey: 1,
        primary: true,
        confirm: true,
      })
    );
    stack.appendChild(
      createChoiceButton('Stay Here', () => dispatch({ type: 'RESOLVE_ELEVATOR', ride: false }), {
        hotkey: 2,
      })
    );
    appendUndoControls(stack, state, dispatch, true);
    return;
  }

  if (state.phase === 'EVENT_PICK') {
    renderEventPickPanel(stack, state, dispatch);
    return;
  }

  if (state.phase === 'EVENT_PICK_STORE') {
    renderEventStorePanel(
      stack,
      state,
      dispatch,
      viewOptions.onUiChange,
      viewOptions.onHoverShop,
      viewOptions.syncedSignatures
    );
    return;
  }

  if (state.phase === 'EVENT_SHOES_CHOICE') {
    renderShoesChoicePanel(stack, state, dispatch, viewOptions.onPreviewWalkSound);
    return;
  }

  if (state.phase === 'BANK_MENU') {
    renderBankPanel(
      stack,
      state,
      dispatch,
      viewOptions.onUiChange,
      viewOptions.onHoverShop,
      viewOptions.syncedSignatures
    );
    return;
  }

  if (state.phase === 'SHOP_BUY_SLOT') {
    renderBuySlotPanel(stack, state, dispatch, viewOptions.syncedSignatures);
    appendUndoControls(stack, state, dispatch, true);
    return;
  }

  if (state.phase === 'SHOP_DELIVER') {
    renderDeliverPanel(
      stack,
      state,
      dispatch,
      viewOptions.onUiChange,
      viewOptions.onHoverShop,
      viewOptions.syncedSignatures
    );
    appendUndoControls(stack, state, dispatch, true);
    return;
  }

  if (state.phase === 'SHOP_BUY_RIVAL') {
    renderBuyRivalPanel(stack, state, dispatch, viewOptions.syncedSignatures);
    appendUndoControls(stack, state, dispatch, true);
    return;
  }

  if (state.phase === 'LIQUIDATE_ASSETS') {
    renderLiquidatePanel(
      stack,
      state,
      dispatch,
      viewOptions.onUiChange,
      viewOptions.onHoverShop,
      viewOptions.syncedSignatures
    );
    return;
  }

  if (state.phase === 'GAME_OVER') {
    const winnerIds = getWinnerIds(state);
    const winners = winnerIds
      .map((id) => state.players.find((p) => p.id === id)?.name)
      .filter((n): n is string => Boolean(n));
    const msg = document.createElement('strong');
    msg.textContent =
      winners.length > 1
        ? `Tied Winners: ${winners.join(' & ')}!`
        : `Winner: ${winners[0] ?? 'Unknown'}!`;
    stack.appendChild(msg);
    if (viewOptions.onOpenVictory) {
      stack.appendChild(makeBtn('🏆 View Match Results', viewOptions.onOpenVictory, { primary: true }));
    }
    if (viewOptions.onOpenSetup) {
      stack.appendChild(
        makeBtn('Match Setup / New Match', viewOptions.onOpenSetup, { primary: !viewOptions.onOpenVictory })
      );
    }
  }
}