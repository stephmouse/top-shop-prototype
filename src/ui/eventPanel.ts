import { STORE_TYPES } from '../config/balance';
import type { GameAction } from '../engine/actions';
import { computeShopAssetValue, getActivePlayer } from '../engine/helpers';
import { getAllowedStoreTypeIds } from '../engine/shops';
import type { GameState, Shop } from '../engine/types';

type DispatchFn = (action: GameAction) => void;

function formatLoc(state: GameState, shop: Shop): string {
  const t = state.tiles[shop.tileId];
  return t ? `${t.floor}F:${t.col + 1}` : shop.id;
}

export function renderEventStorePanel(
  container: HTMLElement,
  state: GameState,
  dispatch: DispatchFn
): void {
  const prompt = state.eventStorePrompt;
  if (!prompt) return;
  const active = getActivePlayer(state);
  const list = document.createElement('div');
  list.className = 'card-list';

  if (prompt.mode === 'sell' || prompt.mode === 'lose') {
    const owned = Object.values(state.shops).filter((s) => s.ownerId === active.id);
    for (const shop of owned) {
      const def = shop.storeTypeId ? STORE_TYPES[shop.storeTypeId] : undefined;
      const payout = prompt.mode === 'sell'
        ? Math.floor(computeShopAssetValue(shop) * prompt.multiplier)
        : 0;
      const btn = document.createElement('button');
      btn.textContent = prompt.mode === 'sell'
        ? `Sell ${formatLoc(state, shop)} ${def?.name ?? 'Store'} L${shop.level} (+$${payout})`
        : `Forfeit ${formatLoc(state, shop)} ${def?.name ?? 'Store'} L${shop.level}`;
      btn.addEventListener('click', () => dispatch({ type: 'RESOLVE_EVENT_STORE', shopId: shop.id }));
      list.appendChild(btn);
    }
  } else {
    const emptySlots = Object.values(state.shops).filter(
      (s) =>
        s.ownerId === null &&
        !Object.values(state.shops).some((o) => o.ownerId === active.id && o.segmentId === s.segmentId)
    );
    const slotSelect = document.createElement('select');
    for (const s of emptySlots) {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = `Slot ${formatLoc(state, s)} (${s.segmentId})`;
      slotSelect.appendChild(opt);
    }
    list.appendChild(slotSelect);

    const storeBtns = document.createElement('div');
    storeBtns.className = 'card-list';

    const rebuildTypes = () => {
      storeBtns.innerHTML = '';
      const slot = state.shops[slotSelect.value];
      if (!slot) return;
      const allowed = getAllowedStoreTypeIds(state, active.id, slot.segmentId)
        .map((id) => STORE_TYPES[id])
        .filter((d): d is NonNullable<typeof d> => Boolean(d))
        .sort((a, b) => b.baseOpenCost - a.baseOpenCost);

      for (const def of allowed) {
        const btn = document.createElement('button');
        btn.className = 'primary';
        btn.disabled = active.cash < def.baseOpenCost;
        btn.textContent = `Open ${def.name} at ${formatLoc(state, slot)} ($${def.baseOpenCost})`;
        btn.addEventListener('click', () =>
          dispatch({ type: 'RESOLVE_EVENT_STORE', shopId: slot.id, storeTypeId: def.id })
        );
        storeBtns.appendChild(btn);
      }
    };

    slotSelect.addEventListener('change', rebuildTypes);
    rebuildTypes();
    list.appendChild(storeBtns);
  }

  if (!prompt.forced) {
    const skip = document.createElement('button');
    skip.textContent = 'Decline / Skip';
    skip.addEventListener('click', () => dispatch({ type: 'SKIP_EVENT_STORE' }));
    list.appendChild(skip);
  }

  container.appendChild(list);
}