import { EVENT_CARDS, STORE_TYPES } from '../config/balance';
import type { GameAction } from '../engine/actions';
import { computeEventBaseCash } from '../engine/events';
import { computeShopAssetValue, getActivePlayer } from '../engine/helpers';
import { getAllowedStoreTypeIds } from '../engine/shops';
import type { EventCardDef, GameState, Shop } from '../engine/types';
import {
  getEligibleEventEmptySlots,
  getEventSelectedShopId,
  handleEventSellPickClick,
  setEventSelectedShopId,
} from './boardPickState';
import { formatLotLabel, groupEmptyLotsBySection } from './lotLabels';

type DispatchFn = (action: GameAction) => void;

function formatCardTags(def: EventCardDef, baseCash: number): { scaledTag: string; ptsTag: string } {
  const scaledTag =
    def.effect.kind === 'cash_gift_scaled' ||
    def.effect.kind === 'pay_each_rival_scaled' ||
    def.effect.kind === 'collect_each_rival_scaled' ||
    def.effect.kind === 'drop_cash_scaled'
      ? ` [$${Math.floor(baseCash * def.effect.baseMultiplier)}]`
      : '';
  return { scaledTag, ptsTag: def.awardsPoints ? '+1–3 pts' : '0 pts' };
}

function mkSpan(className: string, text: string): HTMLSpanElement {
  return Object.assign(document.createElement('span'), { className, textContent: text });
}

export function renderEventPickPanel(
  container: HTMLElement,
  state: GameState,
  dispatch: DispatchFn
): void {
  container.innerHTML = '';
  const revealedSlot = state.revealedEventSlot ?? null;
  const chosenCardId = revealedSlot !== null ? (state.eventChoices[revealedSlot] ?? null) : null;

  const header = Object.assign(document.createElement('div'), { className: 'event-pick-header' });
  const grid = Object.assign(document.createElement('div'), { className: 'event-cards-grid' });
  const baseCash = computeEventBaseCash(state.totalMonths);
  const pickedDef = chosenCardId ? EVENT_CARDS.find((c) => c.id === chosenCardId) : undefined;

  if (revealedSlot === null || !chosenCardId || !pickedDef) {
    header.appendChild(mkSpan('', 'Choose 1 of 3 face-down Event Cards'));
    state.eventChoices.forEach((_cardId, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'event-card-btn is-facedown';
      btn.append(
        mkSpan('event-card-badge', `EVENT CARD ${idx + 1}`),
        mkSpan('event-card-emblem', '?'),
        mkSpan('event-card-desc', 'Click to Flip')
      );
      btn.addEventListener('click', () => dispatch({ type: 'REVEAL_EVENT_CARD', slotIndex: idx }));
      grid.appendChild(btn);
    });
  } else {
    const commitPick = () => dispatch({ type: 'PICK_EVENT_CARD', cardId: chosenCardId });
    const { scaledTag, ptsTag } = formatCardTags(pickedDef, baseCash);
    header.appendChild(mkSpan('', `${pickedDef.name}: ${pickedDef.description}${scaledTag} (${ptsTag})`));
    const applyBtn = Object.assign(document.createElement('button'), {
      type: 'button',
      className: 'primary',
      textContent: 'Apply Event (Space)',
    });
    applyBtn.dataset.pencilPrimary = 'true';
    applyBtn.addEventListener('click', commitPick);
    header.appendChild(applyBtn);
    grid.className = 'event-cards-grid is-revealed-grid';

    state.eventChoices.forEach((cardId, idx) => {
      const def = EVENT_CARDS.find((c) => c.id === cardId);
      if (!def) return;
      const isPicked = idx === revealedSlot;
      const tags = formatCardTags(def, baseCash);
      const cardBtn = document.createElement('button');
      cardBtn.type = 'button';
      cardBtn.className = `event-card-btn is-revealed is-flipping ${isPicked ? 'is-picked' : 'is-unpicked'}`;
      cardBtn.style.animationDelay = isPicked ? '0ms' : '130ms';
      cardBtn.disabled = !isPicked;
      cardBtn.append(
        mkSpan('event-card-badge', isPicked ? 'YOUR PICK' : 'UNPICKED'),
        mkSpan('event-card-title', `${def.name} (${tags.ptsTag})`),
        mkSpan('event-card-desc', `${def.description}${tags.scaledTag}`)
      );
      if (isPicked) cardBtn.addEventListener('click', commitPick);
      grid.appendChild(cardBtn);
    });
  }

  container.append(header, grid);
}

function bindHoverShop(btn: HTMLElement, shopId: string, onHoverShop?: (shopId: string | null) => void): void {
  if (!onHoverShop) return;
  btn.addEventListener('mouseenter', () => onHoverShop(shopId));
  btn.addEventListener('mouseleave', () => onHoverShop(null));
  btn.addEventListener('focus', () => onHoverShop(shopId));
  btn.addEventListener('blur', () => onHoverShop(null));
}

function formatLoc(state: GameState, shop: Shop): string {
  const t = state.tiles[shop.tileId];
  return t ? `${t.floor}F:${t.col + 1}` : shop.id;
}

export function renderEventStorePanel(
  container: HTMLElement,
  state: GameState,
  dispatch: DispatchFn,
  onUiChange?: () => void,
  onHoverShop?: (shopId: string | null) => void
): void {
  const prompt = state.eventStorePrompt;
  if (!prompt) return;
  const active = getActivePlayer(state);
  const list = document.createElement('div');
  list.className = 'card-list';
  container.appendChild(list);

  const render = () => {
    const notify = () => (onUiChange ? onUiChange() : render());
    list.innerHTML = '';

    if (prompt.mode === 'sell') {
      const owned = Object.values(state.shops).filter((s) => s.ownerId === active.id);
      const confirmId = getEventSelectedShopId(state);
      const note = document.createElement('div');
      note.textContent = `Pick a store to sell at ${prompt.multiplier}x (click below or on map, twice to confirm):`;
      list.appendChild(note);

      for (const shop of owned) {
        const def = shop.storeTypeId ? STORE_TYPES[shop.storeTypeId] : undefined;
        const payout = Math.floor(computeShopAssetValue(shop) * prompt.multiplier);
        const isConfirming = confirmId === shop.id;
        const btn = document.createElement('button');
        if (isConfirming) btn.className = 'primary';
        btn.style.borderLeft = `4px solid ${active.color}`;
        const baseLabel = `Sell ${formatLoc(state, shop)} ${def?.name ?? 'Store'} L${shop.level} (+$${payout})`;
        btn.textContent = isConfirming ? `Confirm? ${baseLabel}` : baseLabel;
        bindHoverShop(btn, shop.id, onHoverShop);
        btn.addEventListener('click', () => handleEventSellPickClick(state, shop.id, dispatch, notify));
        list.appendChild(btn);
      }
    } else {
      const payer = prompt.payerId
        ? state.players.find((p) => p.id === prompt.payerId) ?? active
        : active;
      const emptySlots = getEligibleEventEmptySlots(state);
      const selectedId = getEventSelectedShopId(state);
      const pickedSlot = selectedId ? emptySlots.find((s) => s.id === selectedId) : undefined;

      if (pickedSlot) {
        const backBtn = document.createElement('button');
        backBtn.textContent = '← Back to Empty Lots';
        backBtn.addEventListener('click', () => {
          onHoverShop?.(null);
          setEventSelectedShopId(state, null);
          notify();
        });
        list.appendChild(backBtn);

        const slotNote = document.createElement('div');
        slotNote.textContent = `Pick store type to open at ${formatLotLabel(state, pickedSlot)}:`;
        list.appendChild(slotNote);

        const allowed = getAllowedStoreTypeIds(state, active.id, pickedSlot.segmentId)
          .map((id) => STORE_TYPES[id])
          .filter((d): d is NonNullable<typeof d> => Boolean(d))
          .sort((a, b) => b.baseOpenCost - a.baseOpenCost);

        const payerTag = payer.id === active.id ? '' : ` — paid by ${payer.name}`;
        for (const def of allowed) {
          const btn = document.createElement('button');
          btn.className = 'primary';
          btn.disabled = payer.cash < def.baseOpenCost;
          btn.textContent = `Open ${def.name} ($${def.baseOpenCost}${payerTag})`;
          btn.addEventListener('click', () => {
            onHoverShop?.(null);
            setEventSelectedShopId(state, null);
            dispatch({ type: 'RESOLVE_EVENT_STORE', shopId: pickedSlot.id, storeTypeId: def.id });
          });
          list.appendChild(btn);
        }
      } else {
        setEventSelectedShopId(state, null);
        const pickNote = document.createElement('div');
        pickNote.textContent =
          emptySlots.length > 0
            ? 'Pick an empty lot (below or on the map):'
            : 'No eligible empty lots available.';
        list.appendChild(pickNote);

        for (const group of groupEmptyLotsBySection(state, emptySlots, active.id)) {
          const groupEl = document.createElement('div');
          groupEl.className = 'lot-group';
          const hdr = document.createElement('div');
          hdr.className = 'lot-group-header';
          hdr.append(mkSpan('', group.title), mkSpan('lot-group-sub', group.storeSummary));
          const slotsRow = document.createElement('div');
          slotsRow.className = 'lot-group-slots';
          for (const item of group.items) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = `Spot ${item.spotNum} (${item.coord})${item.isChainAdjacent ? ' ★ Chain' : ''}`;
            bindHoverShop(btn, item.shop.id, onHoverShop);
            btn.addEventListener('click', () => {
              onHoverShop?.(null);
              setEventSelectedShopId(state, item.shop.id);
              notify();
            });
            slotsRow.appendChild(btn);
          }
          groupEl.append(hdr, slotsRow);
          list.appendChild(groupEl);
        }
      }
    }

    if (!prompt.forced) {
      const skip = document.createElement('button');
      skip.textContent = prompt.fromBank ? 'Cancel & Return to Bank' : 'Decline / Skip';
      skip.addEventListener('click', () => {
        onHoverShop?.(null);
        setEventSelectedShopId(state, null);
        dispatch({ type: 'SKIP_EVENT_STORE' });
      });
      list.appendChild(skip);
    }
  };

  render();
}