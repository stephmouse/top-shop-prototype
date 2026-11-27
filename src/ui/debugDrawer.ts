import { EVENT_CARDS, PENCIL_FACES, STORE_TYPES } from '../config/balance';
import type { GameAction } from '../engine/actions';
import { formatCalendarDate } from '../engine/eventDraw';
import { formatShopRef, formatTileCoord, getActivePlayer } from '../engine/helpers';
import type { GameState } from '../engine/types';
import type { NetRole } from '../net/protocol';
import {
  debugAdjustPlayer,
  debugAdvanceMonth,
  debugAdvanceTurn,
  debugForceRoll,
  debugMutateShop,
  debugOpenBankMenu,
  debugSeedSampleStats,
  debugTriggerEventCard,
  debugTriggerVictory,
} from './debugActions';
import { addLobbySection, mk, mkBtn } from './lobbyRoomView';

const DEBUG_UNLOCK_KEY = 'top_shop_debug_unlocked_v1';

export function isDebugUnlocked(): boolean {
  if (import.meta.env.DEV) return true;
  if (typeof window === 'undefined') return false;
  try {
    const param = new URLSearchParams(window.location.search).get('debug');
    if (param === '1' || param === 'true') return true;
    return window.sessionStorage?.getItem(DEBUG_UNLOCK_KEY) === '1';
  } catch {
    return false;
  }
}

export function setDebugUnlocked(unlocked: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (unlocked) window.sessionStorage?.setItem(DEBUG_UNLOCK_KEY, '1');
    else window.sessionStorage?.removeItem(DEBUG_UNLOCK_KEY);
  } catch { /* Ignore storage errors */ }
}

export interface DebugDrawerOptions {
  getState: () => GameState;
  getRole: () => NetRole;
  onApplyDebugState: (next: GameState) => void;
  onDispatchAction: (action: GameAction) => void;
  onVisibilityChange?: () => void;
}

export interface DebugDrawerController {
  el: HTMLElement;
  open: () => void;
  close: () => void;
  toggle: () => void;
  isOpen: () => boolean;
  refresh: () => void;
}

function mkSelect(ariaLabel: string): HTMLSelectElement {
  const sel = document.createElement('select');
  sel.className = 'debug-select';
  sel.setAttribute('aria-label', ariaLabel);
  return sel;
}

/** Creates the right-docked non-blocking Debug Side Drawer for local & host playtesting. */
export function createDebugDrawer(options: DebugDrawerOptions): DebugDrawerController {
  let visible = false;
  let selectedPlayerId = '';
  let selectedTileId = '';
  let selectedEventId = EVENT_CARDS[0]?.id ?? '';
  let selectedShopId = '';
  let selectedOwnerId = '';
  let selectedStoreTypeId = '';
  let selectedWinnerId = '';

  const drawer = Object.assign(document.createElement('aside'), {
    className: 'debug-drawer',
    hidden: true,
  });
  drawer.setAttribute('aria-label', 'Debug Tools');

  const close = () => {
    if (!visible) return;
    visible = false;
    drawer.hidden = true;
    options.onVisibilityChange?.();
  };

  const render = () => {
    drawer.innerHTML = '';
    const role = options.getRole();
    if (role === 'guest') {
      visible = false;
      drawer.hidden = true;
      return;
    }

    const state = options.getState();
    const active = getActivePlayer(state);
    if (!state.players.some((p) => p.id === selectedPlayerId)) selectedPlayerId = active.id;
    if (!state.players.some((p) => p.id === selectedOwnerId)) selectedOwnerId = active.id;
    if (!state.players.some((p) => p.id === selectedWinnerId)) selectedWinnerId = active.id;

    const tilesSorted = Object.values(state.tiles).sort((a, b) => a.floor - b.floor || a.col - b.col);
    const shopsSorted = Object.values(state.shops).sort((a, b) => {
      const ta = state.tiles[a.tileId];
      const tb = state.tiles[b.tileId];
      return (ta?.floor ?? 0) - (tb?.floor ?? 0) || (ta?.col ?? 0) - (tb?.col ?? 0);
    });
    if (!state.tiles[selectedTileId]) selectedTileId = tilesSorted[0]?.id ?? '';
    if (!state.shops[selectedShopId]) selectedShopId = shopsSorted[0]?.id ?? '';

    const header = mk('div', 'debug-header');
    header.append(mk('strong', 'debug-title', '🛠 Debug Tools'), mkBtn('Close (F9)', close));
    drawer.appendChild(header);

    const statusBar = mk(
      'div',
      'debug-status-bar',
      `${formatCalendarDate(state.month, state.year)} · T${state.turnNumber} · ${active.name} · ${state.phase}`
    );
    drawer.appendChild(statusBar);

    if (role === 'host') {
      drawer.appendChild(mk('div', 'debug-host-banner', 'HOST MODE: changes broadcast live to guests'));
    }

    const body = mk('div', 'debug-body');

    // 1. Turn & Dice
    const turnSec = addLobbySection('Turn & Pencil', 'debug-section');
    const diceGrid = mk('div', 'debug-dice-grid');
    for (const face of PENCIL_FACES) {
      const btn = mkBtn(
        String(face),
        () => options.onApplyDebugState(debugForceRoll(options.getState(), face)),
        face === 'E' ? 'primary' : '',
        state.phase !== 'ROLL_PENCIL'
      );
      btn.title = `Force roll ${face}`;
      diceGrid.appendChild(btn);
    }
    const flowRow = mk('div', 'debug-grid-3');
    flowRow.append(
      mkBtn('Open Bank', () => options.onApplyDebugState(debugOpenBankMenu(options.getState()))),
      mkBtn('End Turn', () => options.onApplyDebugState(debugAdvanceTurn(options.getState()))),
      mkBtn('+1 Month', () => options.onApplyDebugState(debugAdvanceMonth(options.getState())))
    );
    turnSec.append(diceGrid, flowRow);
    body.appendChild(turnSec);

    // 2. Player Editor
    const playerSec = addLobbySection('Player Editor', 'debug-section');
    const playerRow = mk('div', 'debug-field-row');
    const pSel = mkSelect('Target player');
    for (const p of state.players) {
      pSel.appendChild(new Option(`${p.name}${p.id === active.id ? ' (Active)' : ''}`, p.id));
    }
    pSel.value = selectedPlayerId;
    pSel.addEventListener('change', () => {
      selectedPlayerId = pSel.value;
      render();
    });
    playerRow.append(
      pSel,
      mkBtn('Active', () => {
        selectedPlayerId = getActivePlayer(options.getState()).id;
        render();
      })
    );

    const targetPlayer = state.players.find((p) => p.id === selectedPlayerId) ?? active;
    const targetTile = state.tiles[targetPlayer.tileId];
    const playerMeta = mk(
      'div',
      'debug-hint',
      `Cash: $${targetPlayer.cash} · Pts: ${targetPlayer.points} · Tile: ${targetTile ? formatTileCoord(targetTile) : targetPlayer.tileId}${targetPlayer.isBankrupt ? ' · BANKRUPT' : ''}${targetPlayer.doubleNextPayday ? ' · 2× Payday' : ''}`
    );

    const cashRow = mk('div', 'debug-grid-4');
    cashRow.append(
      mkBtn('+$1k', () => options.onApplyDebugState(debugAdjustPlayer(options.getState(), selectedPlayerId, { cashDelta: 1000 }))),
      mkBtn('+$5k', () => options.onApplyDebugState(debugAdjustPlayer(options.getState(), selectedPlayerId, { cashDelta: 5000 }))),
      mkBtn('-$1k', () => options.onApplyDebugState(debugAdjustPlayer(options.getState(), selectedPlayerId, { cashDelta: -1000 }))),
      mkBtn('-$200!', () => options.onApplyDebugState(debugAdjustPlayer(options.getState(), selectedPlayerId, { setCash: -200 })))
    );

    const ptsRow = mk('div', 'debug-grid-3');
    ptsRow.append(
      mkBtn('+10 pts', () => options.onApplyDebugState(debugAdjustPlayer(options.getState(), selectedPlayerId, { pointsDelta: 10 }))),
      mkBtn('+50 pts', () => options.onApplyDebugState(debugAdjustPlayer(options.getState(), selectedPlayerId, { pointsDelta: 50 }))),
      mkBtn('99 pts', () => options.onApplyDebugState(debugAdjustPlayer(options.getState(), selectedPlayerId, { setPoints: 99 })))
    );

    const flagRow = mk('div', 'debug-grid-2');
    flagRow.append(
      mkBtn('Toggle Bankrupt', () => options.onApplyDebugState(debugAdjustPlayer(options.getState(), selectedPlayerId, { toggleBankrupt: true }))),
      mkBtn('Toggle 2x Payday', () => options.onApplyDebugState(debugAdjustPlayer(options.getState(), selectedPlayerId, { toggleDoublePayday: true })))
    );

    const teleRow = mk('div', 'debug-field-row');
    const tileSel = mkSelect('Teleport tile');
    for (const t of tilesSorted) {
      const label =
        t.type === 'shop' && t.shopSlotId && state.shops[t.shopSlotId]
          ? `${formatTileCoord(t)} · ${formatShopRef(state, state.shops[t.shopSlotId]!)}`
          : `${formatTileCoord(t)} · ${t.type.toUpperCase()}`;
      tileSel.appendChild(new Option(label, t.id));
    }
    tileSel.value = selectedTileId;
    tileSel.addEventListener('change', () => {
      selectedTileId = tileSel.value;
    });
    teleRow.append(
      tileSel,
      mkBtn('Teleport', () => options.onApplyDebugState(debugAdjustPlayer(options.getState(), selectedPlayerId, { tileId: selectedTileId })))
    );

    playerSec.append(playerRow, playerMeta, cashRow, ptsRow, flagRow, teleRow);
    body.appendChild(playerSec);

    // 3. Event Card Trigger
    const evSec = addLobbySection('Trigger Event Card', 'debug-section');
    const evRow = mk('div', 'debug-field-row');
    const evSel = mkSelect('Event card');
    for (const card of EVENT_CARDS) {
      evSel.appendChild(new Option(card.name, card.id));
    }
    evSel.value = selectedEventId;
    const evDesc = mk('div', 'debug-hint', (EVENT_CARDS.find((c) => c.id === selectedEventId) ?? EVENT_CARDS[0])?.description ?? '');
    evSel.addEventListener('change', () => {
      selectedEventId = evSel.value;
      evDesc.textContent = EVENT_CARDS.find((c) => c.id === selectedEventId)?.description ?? '';
    });
    evRow.append(
      evSel,
      mkBtn('Trigger', () => options.onApplyDebugState(debugTriggerEventCard(options.getState(), selectedEventId)), 'primary')
    );
    evSec.append(evRow, evDesc);
    body.appendChild(evSec);

    // 4. Store Editor
    const shopSec = addLobbySection('Store Slot Editor', 'debug-section');
    const shopSel = mkSelect('Store slot');
    for (const s of shopsSorted) {
      const owner = s.ownerId ? state.players.find((p) => p.id === s.ownerId)?.name ?? s.ownerId : 'Empty';
      shopSel.appendChild(new Option(`${formatShopRef(state, s)} [${owner}]`, s.id));
    }
    shopSel.value = selectedShopId;
    shopSel.addEventListener('change', () => {
      selectedShopId = shopSel.value;
      render();
    });

    const curShop = state.shops[selectedShopId];
    const segPool = curShop ? state.segmentPools[curShop.segmentId] ?? [] : [];
    const allTypeIds = [...new Set([...segPool, ...Object.keys(STORE_TYPES)])];
    if (!STORE_TYPES[selectedStoreTypeId]) selectedStoreTypeId = allTypeIds[0] ?? '';

    const assignPair = mk('div', 'debug-field-pair');
    const ownSel = mkSelect('Store owner');
    for (const p of state.players) ownSel.appendChild(new Option(p.name, p.id));
    ownSel.value = selectedOwnerId;
    ownSel.addEventListener('change', () => {
      selectedOwnerId = ownSel.value;
    });
    const typeSel = mkSelect('Store type');
    for (const id of allTypeIds) {
      const def = STORE_TYPES[id];
      if (!def) continue;
      const inPool = segPool.includes(id) ? '★ ' : '';
      typeSel.appendChild(new Option(`${inPool}${def.name} ($${def.baseOpenCost})`, id));
    }
    typeSel.value = selectedStoreTypeId;
    typeSel.addEventListener('change', () => {
      selectedStoreTypeId = typeSel.value;
    });
    assignPair.append(ownSel, typeSel);

    const assignBtn = mkBtn(
      'Assign / Open Store',
      () =>
        options.onApplyDebugState(
          debugMutateShop(options.getState(), selectedShopId, {
            kind: 'assign',
            ownerId: selectedOwnerId,
            storeTypeId: selectedStoreTypeId,
          })
        ),
      'primary debug-full-btn'
    );

    const shopOpsTop = mk('div', 'debug-grid-3');
    shopOpsTop.append(
      mkBtn('Fill Cheap', () => options.onApplyDebugState(debugMutateShop(options.getState(), selectedShopId, { kind: 'fill_cheap' }))),
      mkBtn('Fill Costly', () => options.onApplyDebugState(debugMutateShop(options.getState(), selectedShopId, { kind: 'fill_costly' }))),
      mkBtn('Empty', () => options.onApplyDebugState(debugMutateShop(options.getState(), selectedShopId, { kind: 'empty_stock' })))
    );
    const shopOpsBot = mk('div', 'debug-grid-2');
    shopOpsBot.append(
      mkBtn('Close / Reopen', () => options.onApplyDebugState(debugMutateShop(options.getState(), selectedShopId, { kind: 'toggle_closed' }))),
      mkBtn('Clear Slot', () => options.onApplyDebugState(debugMutateShop(options.getState(), selectedShopId, { kind: 'clear' })))
    );
    shopSec.append(shopSel, assignPair, assignBtn, shopOpsTop, shopOpsBot);
    body.appendChild(shopSec);

    // 5. Victory & Stats Sandbox
    const vicSec = addLobbySection('Victory & Stats Sandbox', 'debug-section');
    const seedBtn = mkBtn(
      'Seed 8mo Sample Stats & History',
      () => options.onApplyDebugState(debugSeedSampleStats(options.getState(), 8)),
      'debug-full-btn'
    );
    const winSelRow = mk('div', 'debug-field-row');
    const winLbl = mk('span', 'debug-hint', 'Winner:');
    const winSel = mkSelect('Winner player');
    for (const p of state.players) winSel.appendChild(new Option(p.name, p.id));
    winSel.value = selectedWinnerId;
    winSel.addEventListener('change', () => {
      selectedWinnerId = winSel.value;
    });
    winSelRow.append(winSel, winLbl);

    const winRow = mk('div', 'debug-grid-3');
    winRow.append(
      mkBtn('Win: Assets', () => options.onApplyDebugState(debugTriggerVictory(options.getState(), 'target_assets', selectedWinnerId)), 'primary'),
      mkBtn('Win: Bankrupt', () => options.onApplyDebugState(debugTriggerVictory(options.getState(), 'bankruptcy', selectedWinnerId))),
      mkBtn('Win: 99 pts', () => options.onApplyDebugState(debugTriggerVictory(options.getState(), 'bank_99_points', selectedWinnerId)))
    );
    vicSec.append(seedBtn, winSelRow, winRow);
    body.appendChild(vicSec);

    drawer.appendChild(body);

    if (!import.meta.env.DEV) {
      const footer = mk('div', 'debug-footer');
      footer.append(
        mk('span', 'setup-muted', 'Production debug unlocked'),
        mkBtn('Hide Debug', () => {
          setDebugUnlocked(false);
          close();
        })
      );
      drawer.appendChild(footer);
    }
  };

  const open = () => {
    if (options.getRole() === 'guest') return;
    visible = true;
    render();
    drawer.hidden = false;
    options.onVisibilityChange?.();
  };

  const toggle = () => {
    if (visible) close();
    else open();
  };

  return {
    el: drawer,
    open,
    close,
    toggle,
    isOpen: () => visible,
    refresh: () => {
      if (options.getRole() === 'guest') close();
      else if (visible) render();
    },
  };
}
