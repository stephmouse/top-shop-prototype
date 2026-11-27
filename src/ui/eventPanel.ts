import { EVENT_CARDS, STORE_TYPES } from '../config/balance';
import { getPlayerSignatureSpec, getShopDisplayName } from '../config/signatureStore';
import type { SignatureStoreSpec } from '../config/signatureStore';
import type { GameAction } from '../engine/actions';
import { computeEventBaseCash } from '../engine/events';
import { computeShopAssetValue, formatTileCoord, getActivePlayer } from '../engine/helpers';
import { computeOpenShopCost, getAllowedStoreTypeIds, getSignatureOpenEligibility } from '../engine/shops';
import type { EventCardDef, GameState, Shop } from '../engine/types';
import {
  getEligibleEventEmptySlots,
  getEventConfirmStoreTypeId,
  getEventSelectedShopId,
  handleEventConvertPickClick,
  handleEventSellPickClick,
  setEventConfirmStoreTypeId,
  setEventSelectedShopId,
} from './boardPickState';
import { createChoiceButton, decorateChoiceButton, makeChoiceHeaderRow } from './choiceUi';
import { formatLotLabel, groupEmptyLotsBySection } from './lotLabels';
import { getDisplayPlayerColor } from './themeConfig';

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
    header.appendChild(mkSpan('', 'Choose 1 of 3 face-down Event Cards (click or press 1–3)'));
    state.eventChoices.forEach((_cardId, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'event-card-btn is-facedown';
      btn.append(
        mkSpan('event-card-badge', `EVENT CARD ${idx + 1}`),
        mkSpan('event-card-emblem', '?'),
        mkSpan('event-card-desc', 'Click to Flip')
      );
      decorateChoiceButton(btn, { hotkey: idx + 1, nav: true });
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
      if (isPicked) {
        const cardBtn = document.createElement('button');
        cardBtn.type = 'button';
        cardBtn.className = 'event-card-btn is-revealed is-flipping is-picked';
        cardBtn.style.animationDelay = '0ms';
        cardBtn.append(
          mkSpan('event-card-badge', 'DRAWN CARD'),
          mkSpan('event-card-title', `${def.name} (${tags.ptsTag})`),
          mkSpan('event-card-desc', `${def.description}${tags.scaledTag}`)
        );
        cardBtn.addEventListener('click', commitPick);
        grid.appendChild(cardBtn);
      } else {
        const cardEl = document.createElement('div');
        cardEl.className = 'event-card-btn is-revealed is-flipping is-unpicked';
        cardEl.setAttribute('aria-disabled', 'true');
        cardEl.style.animationDelay = '130ms';
        cardEl.append(
          mkSpan('event-card-badge', 'NOT DRAWN'),
          mkSpan('event-card-title', `${def.name} (${tags.ptsTag})`),
          mkSpan('event-card-desc', `${def.description}${tags.scaledTag}`)
        );
        grid.appendChild(cardEl);
      }
    });
  }

  container.append(header, grid);
}

function formatLoc(state: GameState, shop: Shop): string {
  const t = state.tiles[shop.tileId];
  return t ? formatTileCoord(t) : shop.id;
}

export function renderEventStorePanel(
  container: HTMLElement,
  state: GameState,
  dispatch: DispatchFn,
  onUiChange?: () => void,
  onHoverShop?: (shopId: string | null) => void,
  syncedSignatures?: Readonly<Record<string, SignatureStoreSpec>>
): void {
  const prompt = state.eventStorePrompt;
  if (!prompt) return;
  const active = getActivePlayer(state);
  const activeSpec = getPlayerSignatureSpec(active.id, state.players, syncedSignatures);
  const list = document.createElement('div');
  list.className = 'card-list';
  container.appendChild(list);

  const render = () => {
    const notify = () => (onUiChange ? onUiChange() : render());
    list.innerHTML = '';

    const skipLabel =
      prompt.mode === 'convert_signature'
        ? 'Keep Standard Store'
        : prompt.fromBank
          ? 'Cancel & Return to Bank'
          : 'Decline / Skip';
    const skipBtn = !prompt.forced
      ? createChoiceButton(
          skipLabel,
          () => {
            onHoverShop?.(null);
            setEventSelectedShopId(state, null);
            dispatch({ type: 'SKIP_EVENT_STORE' });
          },
          { skip: true }
        )
      : null;

    if (prompt.mode === 'convert_signature') {
      const candidateIds = prompt.candidateShopIds ?? [];
      const confirmId = getEventSelectedShopId(state);
      const { headerRow, promptEl } = makeChoiceHeaderRow(
        skipBtn ? [skipBtn] : [],
        `Convert captured top-value store into ★ ${activeSpec?.name ?? 'Signature Store'}? (click twice or press 1–9 then Enter):`
      );
      if (skipBtn) list.appendChild(headerRow);
      if (promptEl) list.appendChild(promptEl);

      candidateIds.forEach((shopId, idx) => {
        const shop = state.shops[shopId];
        if (!shop) return;
        const curName = getShopDisplayName(shop, state.players, syncedSignatures);
        const isConfirming = confirmId === shop.id;
        const baseLabel = `★ Convert ${formatLoc(state, shop)} ${curName} L${shop.level} → ${activeSpec?.name ?? 'Signature Store'}`;
        const btn = createChoiceButton(
          isConfirming ? `Confirm? ${baseLabel}` : baseLabel,
          () => {
            onHoverShop?.(null);
            handleEventConvertPickClick(state, shop.id, dispatch, notify);
          },
          {
            hotkey: idx < 9 ? idx + 1 : undefined,
            shopId: shop.id,
            onHoverShop,
            primary: isConfirming,
            confirm: isConfirming,
            nav: true,
            accentColor: activeSpec?.accent,
          }
        );
        btn.classList.add('is-signature-choice');
        list.appendChild(btn);
      });
    } else if (prompt.mode === 'sell') {
      const owned = Object.values(state.shops).filter((s) => s.ownerId === active.id);
      const confirmId = getEventSelectedShopId(state);
      const { headerRow, promptEl } = makeChoiceHeaderRow(
        skipBtn ? [skipBtn] : [],
        `Pick a store to sell at ${prompt.multiplier}x (click twice or press 1–9 then Enter):`
      );
      if (skipBtn) list.appendChild(headerRow);
      if (promptEl) list.appendChild(promptEl);

      owned.forEach((shop, idx) => {
        const storeName = getShopDisplayName(shop, state.players, syncedSignatures);
        const payout = Math.floor(computeShopAssetValue(shop) * prompt.multiplier);
        const isConfirming = confirmId === shop.id;
        const baseLabel = `Sell ${formatLoc(state, shop)} ${storeName} L${shop.level} (+$${payout})`;
        const btn = createChoiceButton(
          isConfirming ? `Confirm? ${baseLabel}` : baseLabel,
          () => {
            onHoverShop?.(null);
            handleEventSellPickClick(state, shop.id, dispatch, notify);
          },
          {
            hotkey: idx < 9 ? idx + 1 : undefined,
            shopId: shop.id,
            onHoverShop,
            primary: isConfirming,
            confirm: isConfirming,
            nav: true,
            accentColor: getDisplayPlayerColor(state.players.indexOf(active), active.color),
          }
        );
        list.appendChild(btn);
      });
    } else {
      const payer = prompt.payerId
        ? state.players.find((p) => p.id === prompt.payerId) ?? active
        : active;
      const emptySlots = getEligibleEventEmptySlots(state);
      const selectedId = getEventSelectedShopId(state);
      const pickedSlot = selectedId ? emptySlots.find((s) => s.id === selectedId) : undefined;

      if (pickedSlot) {
        const backBtn = createChoiceButton(
          '← Back to Empty Lots',
          () => {
            onHoverShop?.(null);
            setEventSelectedShopId(state, null);
            notify();
          },
          { back: true }
        );
        const topControls = skipBtn ? [backBtn, skipBtn] : [backBtn];
        const { headerRow, promptEl } = makeChoiceHeaderRow(
          topControls,
          `Pick store type to open at ${formatLotLabel(state, pickedSlot)} (click twice or press 1–3 then Enter):`
        );
        list.appendChild(headerRow);
        if (promptEl) list.appendChild(promptEl);

        const sigElig = getSignatureOpenEligibility(
          state,
          active.id,
          pickedSlot.segmentId,
          undefined,
          Boolean(activeSpec?.name)
        );
        const optionsWithCost = getAllowedStoreTypeIds(state, active.id, pickedSlot.segmentId)
          .map((id) => {
            const def = STORE_TYPES[id];
            if (!def) return null;
            const { openCost, level } = computeOpenShopCost(state, pickedSlot.id, active.id, id);
            const expandSig = sigElig.isExpandingSignature && Boolean(activeSpec?.name);
            return {
              storeTypeId: def.id,
              displayName: expandSig ? `★ ${activeSpec!.name}` : def.name,
              openCost,
              level,
              asSignature: expandSig,
              key: def.id,
              isSigChoice: expandSig,
            };
          })
          .filter((x): x is NonNullable<typeof x> => Boolean(x))
          .sort((a, b) => b.openCost - a.openCost);

        if (sigElig.canOpenAsSignature && sigElig.highValueTypeId && activeSpec?.name) {
          const hvDef = STORE_TYPES[sigElig.highValueTypeId];
          if (hvDef) {
            const { openCost, level } = computeOpenShopCost(state, pickedSlot.id, active.id, hvDef.id);
            optionsWithCost.push({
              storeTypeId: hvDef.id,
              displayName: `★ ${activeSpec.name}`,
              openCost,
              level,
              asSignature: true,
              key: `${hvDef.id}:sig`,
              isSigChoice: true,
            });
          }
        }

        const confirmTypeKey = getEventConfirmStoreTypeId(state);
        const payerTag = payer.id === active.id ? '' : ` — paid by ${payer.name}`;
        optionsWithCost.forEach(({ storeTypeId, displayName, openCost, level, asSignature, key, isSigChoice }, idx) => {
          const isConfirming = confirmTypeKey === key;
          const levelTag = level > 1 ? ` L${level}` : '';
          const baseLabel = isSigChoice && !sigElig.isExpandingSignature
            ? `Open as ${displayName}${levelTag} ($${openCost}${payerTag})`
            : `Open ${displayName}${levelTag} ($${openCost}${payerTag})`;
          const btn = createChoiceButton(
            isConfirming ? `Confirm? ${baseLabel}` : baseLabel,
            () => {
              if (confirmTypeKey !== key) {
                setEventConfirmStoreTypeId(state, key);
                notify();
                return;
              }
              onHoverShop?.(null);
              setEventSelectedShopId(state, null);
              dispatch({
                type: 'RESOLVE_EVENT_STORE',
                shopId: pickedSlot.id,
                storeTypeId,
                ...(asSignature ? { asSignature: true } : {}),
              });
            },
            {
              hotkey: idx < 9 ? idx + 1 : undefined,
              primary: isConfirming,
              confirm: isConfirming,
              nav: true,
              disabled: payer.cash < openCost,
              accentColor: isSigChoice ? activeSpec?.accent : undefined,
            }
          );
          if (isSigChoice) btn.classList.add('is-signature-choice');
          list.appendChild(btn);
        });
      } else {
        setEventSelectedShopId(state, null);
        const { headerRow, promptEl } = makeChoiceHeaderRow(
          skipBtn ? [skipBtn] : [],
          emptySlots.length > 0
            ? 'Pick an empty lot (below or on the map):'
            : 'No eligible empty lots available.'
        );
        if (skipBtn) list.appendChild(headerRow);
        if (promptEl) list.appendChild(promptEl);

        let lotHotkey = 1;
        for (const group of groupEmptyLotsBySection(state, emptySlots, active.id)) {
          const groupEl = document.createElement('div');
          groupEl.className = 'lot-group';
          const hdr = document.createElement('div');
          hdr.className = 'lot-group-header';
          hdr.append(mkSpan('', group.title), mkSpan('lot-group-sub', group.storeSummary));
          const slotsRow = document.createElement('div');
          slotsRow.className = 'lot-group-slots';
          for (const item of group.items) {
            const btn = createChoiceButton(
              `Spot ${item.spotNum} (${item.coord})${item.isChainAdjacent ? ` ★ Chain L${item.resultingLevel}` : ''}`,
              () => {
                onHoverShop?.(null);
                setEventSelectedShopId(state, item.shop.id);
                notify();
              },
              {
                hotkey: lotHotkey <= 9 ? lotHotkey++ : undefined,
                shopId: item.shop.id,
                onHoverShop,
                nav: true,
              }
            );
            slotsRow.appendChild(btn);
          }
          groupEl.append(hdr, slotsRow);
          list.appendChild(groupEl);
        }
      }
    }
  };

  render();
}