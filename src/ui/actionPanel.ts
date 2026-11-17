import { BANK_REWARDS, EVENT_CARDS, STORE_TYPES } from '../config/balance';
import type { GameAction } from '../engine/actions';
import { canCancelMove, getActivePlayer, getAvailableDirections } from '../engine/helpers';
import type { GameState } from '../engine/types';
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

export function renderActionPanel(
  container: HTMLElement,
  state: GameState,
  dispatch: DispatchFn
): void {
  container.innerHTML = '';
  const active = getActivePlayer(state);

  const heading = document.createElement('h3');
  heading.className = 'panel-title';
  heading.textContent = `Turn ${state.turnNumber} — ${active.name} (${state.phase})`;
  container.appendChild(heading);

  const stack = document.createElement('div');
  stack.className = 'action-stack';
  container.appendChild(stack);

  if (state.phase === 'ROLL_PENCIL') {
    stack.appendChild(makeBtn('Roll Pencil (1–8 / E)', () => dispatch({ type: 'ROLL_PENCIL' }), { primary: true }));
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
    const list = document.createElement('div');
    list.className = 'card-list';
    for (const cardId of state.eventChoices) {
      const def = EVENT_CARDS.find((c) => c.id === cardId);
      if (!def) continue;
      list.appendChild(
        makeBtn(`${def.name}: ${def.description} (+${def.pointsAwarded} pts)`, () =>
          dispatch({ type: 'PICK_EVENT_CARD', cardId: def.id })
        )
      );
    }
    stack.appendChild(list);
    return;
  }

  if (state.phase === 'BANK_MENU') {
    const list = document.createElement('div');
    list.className = 'card-list';

    const note = document.createElement('div');
    note.textContent = 'Bank Point Exchange (1 action per visit):';
    list.appendChild(note);

    const rivalPlayers = state.players.filter((p) => p.id !== active.id && !p.isBankrupt);
    const rivalShops = Object.values(state.shops).filter((s) => s.ownerId && s.ownerId !== active.id);
    const ownShops = Object.values(state.shops).filter((s) => s.ownerId === active.id);

    const playerSelect = document.createElement('select');
    rivalPlayers.forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `Target Player: ${p.name}`;
      playerSelect.appendChild(opt);
    });

    const shopSelect = document.createElement('select');
    rivalShops.forEach((s) => {
      const owner = state.players.find((p) => p.id === s.ownerId);
      const def = s.storeTypeId ? STORE_TYPES[s.storeTypeId] : undefined;
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = `Target Store: ${def?.name ?? s.id} (${owner?.name ?? '?'})`;
      shopSelect.appendChild(opt);
    });

    if (rivalPlayers.length > 0) list.appendChild(playerSelect);
    if (rivalShops.length > 0) list.appendChild(shopSelect);

    for (const reward of BANK_REWARDS) {
      let disabled = active.points < reward.pointCost;
      if (reward.id === 'remote_deliver' && (ownShops.length === 0 || active.blockDeliveryTurns > 0)) {
        disabled = true;
      }
      if (reward.id === 'block_delivery' && rivalPlayers.length === 0) disabled = true;
      if (reward.id === 'close_rival' && rivalShops.length === 0) disabled = true;

      list.appendChild(
        makeBtn(
          `[${reward.pointCost} pts] ${reward.label}`,
          () =>
            dispatch({
              type: 'REDEEM_BANK_REWARD',
              rewardId: reward.id,
              targetPlayerId: playerSelect.value || undefined,
              targetShopId: shopSelect.value || undefined,
            }),
          { disabled }
        )
      );
    }

    list.appendChild(
      makeBtn(
        state.pendingPostBankPhase === 'STEPPING' ? 'Skip & Continue Moving' : 'Leave Bank',
        () => dispatch({ type: 'CLOSE_BANK_MENU' }),
        { primary: true }
      )
    );
    stack.appendChild(list);
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
  }
}