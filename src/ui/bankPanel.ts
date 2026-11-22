import { BANK_REWARDS, STORE_CAPACITY_BY_LEVEL, STORE_TYPES } from '../config/balance';
import type { GameAction } from '../engine/actions';
import {
  canRedeemBankReward,
  getBankRewardTargets,
  type BankRewardTargetList,
} from '../engine/bank';
import { getActivePlayer } from '../engine/helpers';
import { getShopTotalStock } from '../engine/shops';
import type { BankRewardDef, GameState, Shop } from '../engine/types';
import {
  getBankConfirmShopId,
  getBankPendingRewardId,
  handleBankShopPickClick,
  setBankPendingRewardId,
} from './boardPickState';

type DispatchFn = (action: GameAction) => void;

let filterUsableOnly = true;

function formatShopOption(state: GameState, shop: Shop, includeOwner: boolean): string {
  const tile = state.tiles[shop.tileId];
  const loc = tile ? `${tile.floor}F:${tile.col + 1}` : shop.id;
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
  onBack: () => void
): void {
  const backBtn = document.createElement('button');
  backBtn.textContent = '← Back to Rewards';
  backBtn.addEventListener('click', onBack);
  list.appendChild(backBtn);

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
    for (const p of targets.players) {
      const pShops = Object.values(state.shops).filter((s) => s.ownerId === p.id).length;
      const btn = document.createElement('button');
      btn.style.borderLeft = `4px solid ${p.color}`;
      btn.textContent = `${p.name} ($${p.cash} | ${p.points}p | ${pShops} stores)`;
      btn.addEventListener('click', () => {
        setBankPendingRewardId(state, null);
        dispatch({ type: 'REDEEM_BANK_REWARD', rewardId: reward.id, targetPlayerId: p.id });
      });
      targetsWrap.appendChild(btn);
    }
  } else {
    const confirmId = getBankConfirmShopId(state);
    for (const s of targets.shops) {
      const owner = s.ownerId ? state.players.find((p) => p.id === s.ownerId) : undefined;
      const isConfirming = confirmId === s.id;
      const btn = document.createElement('button');
      if (isConfirming) btn.className = 'primary';
      if (owner) btn.style.borderLeft = `4px solid ${owner.color}`;
      const shopLabel = formatShopOption(state, s, targets.includeOwner);
      btn.textContent = isConfirming ? `Confirm? ${shopLabel}` : shopLabel;
      btn.addEventListener('click', () =>
        handleBankShopPickClick(state, reward.id, s.id, dispatch, notify)
      );
      targetsWrap.appendChild(btn);
    }
  }

  list.appendChild(targetsWrap);
}

export function renderBankPanel(
  container: HTMLElement,
  state: GameState,
  dispatch: DispatchFn,
  onUiChange?: () => void
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
      appendTargetStep(list, state, pendingReward, pendingTargets, dispatch, notify, () => {
        setBankPendingRewardId(state, null);
        notify();
      });
      container.appendChild(list);
      return;
    }

    setBankPendingRewardId(state, null);

    const headerRow = document.createElement('div');
    headerRow.className = 'action-stack';

    const leaveLabel =
      state.pendingPostBankPhase === 'STEPPING' ? 'Skip & Continue Moving' : 'Leave Bank';
    const leaveTopBtn = document.createElement('button');
    leaveTopBtn.className = 'primary';
    leaveTopBtn.textContent = leaveLabel;
    leaveTopBtn.addEventListener('click', () => {
      setBankPendingRewardId(state, null);
      dispatch({ type: 'CLOSE_BANK_MENU' });
    });
    headerRow.appendChild(leaveTopBtn);

    const filterLabel = document.createElement('label');
    const filterCheck = document.createElement('input');
    filterCheck.type = 'checkbox';
    filterCheck.checked = filterUsableOnly;
    filterLabel.appendChild(filterCheck);
    filterLabel.append(` Usable Only (${active.points} pts available)`);
    headerRow.appendChild(filterLabel);
    list.appendChild(headerRow);

    const rewardsWrap = document.createElement('div');
    rewardsWrap.className = 'card-list';
    rewardsWrap.style.maxHeight = '260px';
    rewardsWrap.style.overflowY = 'auto';

    const rebuildRewards = () => {
      rewardsWrap.innerHTML = '';

      for (const reward of BANK_REWARDS) {
        const usable = canRedeemBankReward(state, reward);
        if (filterUsableOnly && !usable) continue;

        const targets = getBankRewardTargets(state, reward);
        const stepHint =
          targets.kind === 'player'
            ? ' → Pick Rival'
            : targets.kind === 'shop'
              ? ' → Pick Store'
              : '';

        const btn = document.createElement('button');
        btn.disabled = !usable;
        const noteText = reward.note ? ` — ${reward.note}` : '';
        btn.textContent = `[${reward.pointCost} pts] ${reward.label}${noteText}${stepHint}`;
        btn.addEventListener('click', () => {
          if (targets.kind === 'none') {
            setBankPendingRewardId(state, null);
            dispatch({ type: 'REDEEM_BANK_REWARD', rewardId: reward.id });
          } else {
            setBankPendingRewardId(state, reward.id);
            notify();
          }
        });
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
