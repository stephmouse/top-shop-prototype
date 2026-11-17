import { BANK_REWARDS, STORE_CAPACITY_BY_LEVEL, STORE_TYPES } from '../config/balance';
import type { GameAction } from '../engine/actions';
import { canRedeemBankReward } from '../engine/bank';
import { getActivePlayer } from '../engine/helpers';
import { getShopTotalStock } from '../engine/shops';
import type { BankRewardDef, GameState, Shop } from '../engine/types';

type DispatchFn = (action: GameAction) => void;

let filterUsableOnly = false;

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

function getSelectedShopId(
  reward: BankRewardDef,
  ownSelect: HTMLSelectElement,
  rivalSelect: HTMLSelectElement
): string | undefined {
  if (reward.target === 'own_shop_any' || reward.target === 'own_shop_upgrade') {
    return ownSelect.value || undefined;
  }
  if (reward.target.startsWith('rival_shop')) {
    return rivalSelect.value || undefined;
  }
  return undefined;
}

export function renderBankPanel(
  container: HTMLElement,
  state: GameState,
  dispatch: DispatchFn
): void {
  const active = getActivePlayer(state);
  const list = document.createElement('div');
  list.className = 'card-list';

  const headerRow = document.createElement('div');
  headerRow.className = 'action-stack';

  const leaveLabel =
    state.pendingPostBankPhase === 'STEPPING' ? 'Skip & Continue Moving' : 'Leave Bank';
  const leaveTopBtn = document.createElement('button');
  leaveTopBtn.className = 'primary';
  leaveTopBtn.textContent = leaveLabel;
  leaveTopBtn.addEventListener('click', () => dispatch({ type: 'CLOSE_BANK_MENU' }));
  headerRow.appendChild(leaveTopBtn);

  const filterLabel = document.createElement('label');
  const filterCheck = document.createElement('input');
  filterCheck.type = 'checkbox';
  filterCheck.checked = filterUsableOnly;
  filterLabel.appendChild(filterCheck);
  filterLabel.append(` Usable Only (${active.points} pts available)`);
  headerRow.appendChild(filterLabel);
  list.appendChild(headerRow);

  const rivalPlayers = state.players.filter((p) => p.id !== active.id && !p.isBankrupt);
  const rivalShops = Object.values(state.shops).filter((s) => s.ownerId && s.ownerId !== active.id);
  const ownShops = Object.values(state.shops).filter((s) => s.ownerId === active.id);

  const selectorsRow = document.createElement('div');
  selectorsRow.className = 'action-stack';

  const playerSelect = document.createElement('select');
  for (const p of rivalPlayers) {
    const pShops = Object.values(state.shops).filter((s) => s.ownerId === p.id).length;
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `Rival: ${p.name} ($${p.cash} | ${p.points}p | ${pShops} stores)`;
    playerSelect.appendChild(opt);
  }
  if (rivalPlayers.length > 0) selectorsRow.appendChild(playerSelect);

  const rivalShopSelect = document.createElement('select');
  for (const s of rivalShops) {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = `Rival Store: ${formatShopOption(state, s, true)}`;
    rivalShopSelect.appendChild(opt);
  }
  if (rivalShops.length > 0) selectorsRow.appendChild(rivalShopSelect);

  const ownShopSelect = document.createElement('select');
  for (const s of ownShops) {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = `Own Store: ${formatShopOption(state, s, false)}`;
    ownShopSelect.appendChild(opt);
  }
  if (ownShops.length > 0) selectorsRow.appendChild(ownShopSelect);

  if (selectorsRow.children.length > 0) {
    list.appendChild(selectorsRow);
  }

  const rewardsWrap = document.createElement('div');
  rewardsWrap.className = 'card-list';
  rewardsWrap.style.maxHeight = '260px';
  rewardsWrap.style.overflowY = 'auto';

  const rebuildRewards = () => {
    rewardsWrap.innerHTML = '';
    const targetPlayerId = playerSelect.value || undefined;

    for (const reward of BANK_REWARDS) {
      const targetShopId = getSelectedShopId(reward, ownShopSelect, rivalShopSelect);
      const usable = canRedeemBankReward(state, reward, targetPlayerId, targetShopId);
      if (filterUsableOnly && !usable) continue;

      const btn = document.createElement('button');
      btn.disabled = !usable;
      const noteText = reward.note ? ` — ${reward.note}` : '';
      btn.textContent = `[${reward.pointCost} pts] ${reward.label}${noteText}`;
      btn.addEventListener('click', () =>
        dispatch({
          type: 'REDEEM_BANK_REWARD',
          rewardId: reward.id,
          targetPlayerId,
          targetShopId,
        })
      );
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
  playerSelect.addEventListener('change', rebuildRewards);
  rivalShopSelect.addEventListener('change', rebuildRewards);
  ownShopSelect.addEventListener('change', rebuildRewards);

  rebuildRewards();
  list.appendChild(rewardsWrap);
  container.appendChild(list);
}
