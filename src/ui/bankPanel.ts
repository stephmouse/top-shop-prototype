import { BANK_REWARDS, STORE_CAPACITY_BY_LEVEL, STORE_TYPES } from '../config/balance';
import type { GameAction } from '../engine/actions';
import {
  canRedeemBankReward,
  getBankRewardTargets,
  type BankRewardTargetList,
} from '../engine/bank';
import { formatTileCoord, getActivePlayer } from '../engine/helpers';
import { getShopTotalStock } from '../engine/shops';
import type { BankRewardDef, GameState, Shop } from '../engine/types';
import {
  getBankConfirmShopId,
  getBankPendingRewardId,
  handleBankShopPickClick,
  setBankPendingRewardId,
} from './boardPickState';
import { createChoiceButton, makeChoiceHeaderRow } from './choiceUi';

type DispatchFn = (action: GameAction) => void;

let filterUsableOnly = true;

function formatShopOption(state: GameState, shop: Shop, includeOwner: boolean): string {
  const tile = state.tiles[shop.tileId];
  const loc = tile ? formatTileCoord(tile) : shop.id;
  const def = shop.storeTypeId ? STORE_TYPES[shop.storeTypeId] : undefined;
  const stock = getShopTotalStock(shop);
  const cap = STORE_CAPACITY_BY_LEVEL[shop.level];
  const owner = state.players.find((p) => p.id === shop.ownerId);
  const ownerTag = includeOwner ? ` (${owner?.name ?? '?'})` : '';
  return `${loc} ${def?.name ?? shop.id} L${shop.level} [${stock}/${cap}]${ownerTag}`;
}

function appendTargetStep(
  list: HTMLElement,
  state: GameState,
  reward: BankRewardDef,
  targets: Exclude<BankRewardTargetList, { kind: 'none' }>,
  dispatch: DispatchFn,
  notify: () => void,
  onBack: () => void,
  onHoverShop?: (shopId: string | null) => void
): void {
  const backBtn = createChoiceButton(
    '← Back to Rewards',
    () => {
      onHoverShop?.(null);
      onBack();
    },
    { back: true }
  );
  const { headerRow } = makeChoiceHeaderRow([backBtn]);
  list.appendChild(headerRow);

  const summary = document.createElement('div');
  const noteText = reward.note ? ` — ${reward.note}` : '';
  summary.textContent = `[${reward.pointCost} pts] ${reward.label}${noteText}`;
  list.appendChild(summary);

  const promptEl = document.createElement('div');
  promptEl.textContent =
    targets.kind === 'shop' ? `${targets.prompt} (click below or on map)` : targets.prompt;
  list.appendChild(promptEl);

  const targetsWrap = document.createElement('div');
  targetsWrap.className = 'card-list';
  targetsWrap.style.maxHeight = '260px';
  targetsWrap.style.overflowY = 'auto';

  if (targets.kind === 'player') {
    targets.players.forEach((p, idx) => {
      const pShops = Object.values(state.shops).filter((s) => s.ownerId === p.id).length;
      const btn = createChoiceButton(
        `${p.name} ($${p.cash} | ${p.points}p | ${pShops} stores)`,
        () => {
          setBankPendingRewardId(state, null);
          dispatch({ type: 'REDEEM_BANK_REWARD', rewardId: reward.id, targetPlayerId: p.id });
        },
        { hotkey: idx < 9 ? idx + 1 : undefined, nav: true, accentColor: p.color }
      );
      targetsWrap.appendChild(btn);
    });
  } else {
    const confirmId = getBankConfirmShopId(state);
    targets.shops.forEach((s, idx) => {
      const owner = s.ownerId ? state.players.find((p) => p.id === s.ownerId) : undefined;
      const isConfirming = confirmId === s.id;
      const shopLabel = formatShopOption(state, s, targets.includeOwner);
      const btn = createChoiceButton(
        isConfirming ? `Confirm? ${shopLabel}` : shopLabel,
        () => {
          onHoverShop?.(null);
          handleBankShopPickClick(state, reward.id, s.id, dispatch, notify);
        },
        {
          hotkey: idx < 9 ? idx + 1 : undefined,
          shopId: s.id,
          onHoverShop,
          primary: isConfirming,
          confirm: isConfirming,
          nav: true,
          accentColor: owner?.color,
        }
      );
      targetsWrap.appendChild(btn);
    });
  }

  list.appendChild(targetsWrap);
}

export function renderBankPanel(
  container: HTMLElement,
  state: GameState,
  dispatch: DispatchFn,
  onUiChange?: () => void,
  onHoverShop?: (shopId: string | null) => void
): void {
  const active = getActivePlayer(state);

  const render = () => {
    const notify = () => (onUiChange ? onUiChange() : render());
    container.innerHTML = '';
    const list = document.createElement('div');
    list.className = 'card-list';

    const pendingRewardId = getBankPendingRewardId(state);
    const pendingReward = pendingRewardId
      ? BANK_REWARDS.find((r) => r.id === pendingRewardId)
      : undefined;
    const pendingTargets = pendingReward ? getBankRewardTargets(state, pendingReward) : null;
    const hasValidTargets =
      pendingTargets !== null &&
      pendingTargets.kind !== 'none' &&
      (pendingTargets.kind === 'player'
        ? pendingTargets.players.length > 0
        : pendingTargets.shops.length > 0);

    if (
      pendingReward &&
      pendingTargets &&
      pendingTargets.kind !== 'none' &&
      hasValidTargets &&
      canRedeemBankReward(state, pendingReward)
    ) {
      appendTargetStep(
        list,
        state,
        pendingReward,
        pendingTargets,
        dispatch,
        notify,
        () => {
          setBankPendingRewardId(state, null);
          notify();
        },
        onHoverShop
      );
      container.appendChild(list);
      return;
    }

    setBankPendingRewardId(state, null);

    const isMaxPts = active.points >= 99;
    const leaveLabel = isMaxPts
      ? state.pendingPostBankPhase === 'STEPPING'
        ? 'Continue Moving (99 pts max)'
        : 'Leave Bank (99 pts max)'
      : state.pendingPostBankPhase === 'STEPPING'
        ? 'Earn +1 Point & Continue Moving'
        : 'Earn +1 Point & Leave Bank';
    const leaveTopBtn = createChoiceButton(
      leaveLabel,
      () => {
        onHoverShop?.(null);
        setBankPendingRewardId(state, null);
        dispatch({ type: 'REDEEM_BANK_REWARD', rewardId: 'bank_01_earn_1pt' });
      },
      { primary: true, skip: true }
    );

    const filterLabel = document.createElement('label');
    const filterCheck = document.createElement('input');
    filterCheck.type = 'checkbox';
    filterCheck.checked = filterUsableOnly;
    filterCheck.dataset.bankUsableToggle = 'true';
    filterLabel.appendChild(filterCheck);
    filterLabel.append(` Usable Only (U) (${active.points} pts available)`);
    const { headerRow } = makeChoiceHeaderRow([leaveTopBtn, filterLabel]);
    list.appendChild(headerRow);

    const rewardsWrap = document.createElement('div');
    rewardsWrap.className = 'card-list';
    rewardsWrap.style.maxHeight = '260px';
    rewardsWrap.style.overflowY = 'auto';

    const rebuildRewards = () => {
      rewardsWrap.innerHTML = '';
      let visibleIdx = 0;

      for (const reward of BANK_REWARDS) {
        if (reward.id === 'bank_01_earn_1pt') continue;
        const usable = canRedeemBankReward(state, reward);
        if (filterUsableOnly && !usable) continue;

        const targets = getBankRewardTargets(state, reward);
        const stepHint =
          targets.kind === 'player'
            ? ' → Pick Rival'
            : targets.kind === 'shop'
              ? ' → Pick Store'
              : '';

        const noteText = reward.note ? ` — ${reward.note}` : '';
        const btn = createChoiceButton(
          `[${reward.pointCost} pts] ${reward.label}${noteText}${stepHint}`,
          () => {
            if (targets.kind === 'none') {
              setBankPendingRewardId(state, null);
              dispatch({ type: 'REDEEM_BANK_REWARD', rewardId: reward.id });
            } else {
              setBankPendingRewardId(state, reward.id);
              notify();
            }
          },
          { hotkey: visibleIdx < 9 ? visibleIdx + 1 : undefined, nav: true, disabled: !usable }
        );
        visibleIdx++;
        rewardsWrap.appendChild(btn);
      }

      if (rewardsWrap.children.length === 0) {
        const emptyNote = document.createElement('div');
        emptyNote.textContent = 'No usable rewards for current points/board state.';
        rewardsWrap.appendChild(emptyNote);
      }
    };

    filterCheck.addEventListener('change', () => {
      filterUsableOnly = filterCheck.checked;
      rebuildRewards();
    });

    rebuildRewards();
    list.appendChild(rewardsWrap);
    container.appendChild(list);
  };

  render();
}
