import { getStageDef } from '../config/maps';
import type { StageId } from '../config/maps';
import { formatCalendarDate } from '../engine/eventDraw';
import { computePlayerNetWorth, computeShopAssetValue } from '../engine/helpers';
import { getPlayerMatchStats } from '../engine/matchStats';
import type { PlayerMatchStats, WinReason } from '../engine/matchStats';
import { getWinnerIds, rankPlayersForStandings } from '../engine/turn';
import type { GameState, Player } from '../engine/types';
import type { NetRole, RoomRoster } from '../net/protocol';
import { createAvatarElement } from './avatarSvg';
import { formatDollars } from './cashCounter';
import { resolvePlayerAvatar } from './hudView';
import { addLobbySection, mk, mkBtn } from './lobbyRoomView';
import { setMoneyText } from './moneyText';
import type { MoneyTextKind } from './moneyText';
import { getDisplayPlayerColor } from './themeConfig';
import { computeMatchAwards } from './victoryAwards';
import { createVictoryChart } from './victoryChart';

export type StatsTabId = 'overview' | 'retail' | 'travel';

export interface VictoryModalOptions {
  getState: () => GameState;
  getOnlineContext: () => {
    role: NetRole;
    roster: RoomRoster | null;
    customAvatars?: Record<string, string>;
  };
  onRematch: () => void;
  onOpenSetup: () => void;
  onReplayFanfare: (reason: WinReason) => void;
}

export interface VictoryModalController {
  el: HTMLElement;
  open: () => void;
  close: () => void;
  isOpen: () => boolean;
  refresh: () => void;
}

const CONFETTI_COLORS = ['#facc15', '#4da3ff', '#4ade80', '#f472b6', '#fb923c', '#c084fc'];

interface RankedRow {
  rank: number;
  playerIdx: number;
  player: Player;
  netWorth: number;
  storeValue: number;
  storeCount: number;
  stats: PlayerMatchStats;
}

function buildRankedRows(state: GameState): RankedRow[] {
  return rankPlayersForStandings(state).map(({ rank, playerIdx, player, netWorth }) => {
    const owned = Object.values(state.shops).filter((s) => s.ownerId === player.id);
    const storeValue = owned.reduce((sum, s) => sum + computeShopAssetValue(s), 0);
    return {
      rank,
      playerIdx,
      player,
      netWorth,
      storeValue,
      storeCount: owned.length,
      stats: getPlayerMatchStats(state, player.id),
    };
  });
}

function formatWinnerNames(winners: Player[]): string {
  if (winners.length <= 1) return winners[0]?.name ?? 'Player';
  if (winners.length === 2) return `${winners[0]!.name} & ${winners[1]!.name}`;
  return `${winners.slice(0, -1).map((p) => p.name).join(', ')} & ${winners[winners.length - 1]!.name}`;
}

export function resolveWinReason(state: GameState): WinReason {
  if (state.winReason) return state.winReason;
  const bankruptCount = state.players.filter((p) => p.isBankrupt).length;
  const activeCount = state.players.length - bankruptCount;
  return activeCount <= 1 || bankruptCount >= state.config.bankruptLimit ? 'bankruptcy' : 'target_assets';
}

function resolveWinHeadline(state: GameState): string {
  const reason = resolveWinReason(state);
  if (reason === 'bank_99_points') return '99-Point Bank Claim Victory!';
  if (reason === 'bankruptcy') {
    const bankruptCount = state.players.filter((p) => p.isBankrupt).length;
    const activeCount = state.players.length - bankruptCount;
    return activeCount <= 1
      ? 'Last Mogul Standing!'
      : `Bankruptcy Limit Reached (${bankruptCount} Bankrupt)`;
  }
  return `Target Assets Reached (${formatDollars(state.config.targetAssets)})`;
}

function makeMoneyCell(text: string, className = '', kind: MoneyTextKind = 'cash'): HTMLTableCellElement {
  const td = document.createElement('td');
  if (className) td.className = className;
  setMoneyText(td, text, kind);
  return td;
}

function buildStatsTable(
  state: GameState,
  rows: RankedRow[],
  tab: StatsTabId,
  online: ReturnType<VictoryModalOptions['getOnlineContext']>
): HTMLElement {
  const wrap = mk('div', 'victory-table-wrap');
  const table = mk('table', 'victory-stats-table');
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');

  const headers: Record<StatsTabId, string[]> = {
    overview: ['Rank', 'Player', 'Final Assets', 'Cash', 'Stores Value', 'Stores', 'Peak Assets', 'Sales Rev', 'Cash Backs', 'Steps'],
    retail: ['Player', 'Sales Rev', 'Shopped', 'Cash Backs', 'Delivered', 'Opened', 'Buyouts (Made/Hit)', 'Closed (Dealt/Hit)', 'Stolen (Taken/Lost)', 'Event Sales', 'Liquidated'],
    travel: ['Player', 'Steps', 'Elevators', 'Escalators', 'Rolls (E)', 'Bank (1.5x)', 'Payday Total', 'Bank Spent', 'Pts (Bank/Shop/Event)', 'Events (Miss)', 'Shoes Put On'],
  };

  for (const label of headers[tab]) {
    const th = document.createElement('th');
    th.textContent = label;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const winnerIdSet = new Set(getWinnerIds(state));
  const tbody = document.createElement('tbody');
  for (const row of rows) {
    const { player, stats } = row;
    const displayColor = getDisplayPlayerColor(row.playerIdx, player.color);
    const isWinner = winnerIdSet.has(player.id);
    const tr = document.createElement('tr');
    if (isWinner) tr.className = 'is-winner-row';
    else if (player.isBankrupt) tr.className = 'is-bankrupt-row';

    const playerCell = document.createElement('td');
    playerCell.className = 'victory-player-cell';
    const avWrap = mk('span', 'victory-mini-avatar');
    avWrap.style.borderColor = displayColor;
    avWrap.appendChild(
      createAvatarElement(resolvePlayerAvatar(state, row.playerIdx, online.roster, online.customAvatars), displayColor)
    );
    const nameEl = mk('span', 'victory-player-name', player.name);
    playerCell.append(avWrap, nameEl);
    if (isWinner) {
      playerCell.appendChild(mk('span', 'victory-inline-badge is-win', winnerIdSet.size > 1 ? 'TIE #1' : 'WIN'));
    } else if (player.isBankrupt) {
      playerCell.appendChild(mk('span', 'victory-inline-badge is-out', 'OUT'));
    }

    if (tab === 'overview') {
      tr.append(
        makeMoneyCell(`#${row.rank}`, 'victory-rank-cell'),
        playerCell,
        makeMoneyCell(formatDollars(row.netWorth), 'victory-num victory-strong', 'asset'),
        makeMoneyCell(formatDollars(player.cash), 'victory-num'),
        makeMoneyCell(formatDollars(row.storeValue), 'victory-num', 'asset'),
        makeMoneyCell(String(row.storeCount), 'victory-num'),
        makeMoneyCell(formatDollars(stats.peakNetWorth), 'victory-num', 'asset'),
        makeMoneyCell(formatDollars(stats.salesRevenue), 'victory-num'),
        makeMoneyCell(`${stats.cashbackCount} (${formatDollars(stats.cashbackTotal)})`, 'victory-num'),
        makeMoneyCell(String(stats.stepsTaken), 'victory-num')
      );
    } else if (tab === 'retail') {
      tr.append(
        playerCell,
        makeMoneyCell(`${formatDollars(stats.salesRevenue)} (${stats.itemsSold})`, 'victory-num'),
        makeMoneyCell(`${formatDollars(stats.shoppingSpent)} (${stats.itemsBought})`, 'victory-num'),
        makeMoneyCell(`${stats.cashbackCount} (${formatDollars(stats.cashbackTotal)})`, 'victory-num'),
        makeMoneyCell(`${stats.itemsDelivered} (${formatDollars(stats.deliverySpent)})`, 'victory-num'),
        makeMoneyCell(String(stats.storesOpened), 'victory-num'),
        makeMoneyCell(`${stats.buyoutsMade} / ${stats.timesBoughtOut}`, 'victory-num'),
        makeMoneyCell(`${stats.rivalShopsClosed} / ${stats.shopsClosedByRivals}`, 'victory-num'),
        makeMoneyCell(`${stats.shopsStolen} / ${stats.shopsLostToTheft}`, 'victory-num'),
        makeMoneyCell(String(stats.shopsSoldByEvent), 'victory-num'),
        makeMoneyCell(
          stats.shopsLiquidated > 0
            ? `${stats.shopsLiquidated} (-${formatDollars(stats.liquidationValueLost)})`
            : '0',
          'victory-num'
        )
      );
    } else {
      tr.append(
        playerCell,
        makeMoneyCell(String(stats.stepsTaken), 'victory-num'),
        makeMoneyCell(String(stats.elevatorsRidden), 'victory-num'),
        makeMoneyCell(String(stats.escalatorsRidden), 'victory-num'),
        makeMoneyCell(`${stats.pencilRolls} (${stats.eventRolls} E)`, 'victory-num'),
        makeMoneyCell(`${player.bankVisits} (${stats.exactBankLandings})`, 'victory-num'),
        makeMoneyCell(formatDollars(stats.paydayTotal), 'victory-num'),
        makeMoneyCell(`${stats.bankRewardsRedeemed} (${stats.pointsSpent}p)`, 'victory-num'),
        makeMoneyCell(`${stats.pointsFromBank} / ${stats.pointsFromShopping} / ${stats.pointsFromEvents}`, 'victory-num'),
        makeMoneyCell(`${stats.eventsDrawn} (${stats.eventMisses})`, 'victory-num'),
        makeMoneyCell(String(stats.shoesPutOn), 'victory-num')
      );
    }

    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

/** Creates the end-of-match Victory Celebration, Awards, Chart & Stats modal. */
export function createVictoryModal(options: VictoryModalOptions): VictoryModalController {
  let visible = false;
  let activeTab: StatsTabId = 'overview';

  const backdrop = Object.assign(mk('div', 'setup-backdrop victory-backdrop'), { hidden: true });
  const modal = mk('div', 'setup-modal victory-modal');
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  backdrop.appendChild(modal);

  const close = () => {
    visible = false;
    backdrop.hidden = true;
  };

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  const render = () => {
    modal.innerHTML = '';
    const state = options.getState();
    const online = options.getOnlineContext();
    const rankedRows = buildRankedRows(state);
    const winnerIdSet = new Set(getWinnerIds(state));
    const winners = rankedRows
      .filter((r) => winnerIdSet.has(r.player.id))
      .map((r) => r.player);
    if (winners.length === 0) {
      winners.push(rankedRows[0]?.player ?? state.players[0]!);
    }
    const leadWinner = winners[0]!;
    const leadIdx = Math.max(0, state.players.findIndex((p) => p.id === leadWinner.id));
    const leadDisplayColor = getDisplayPlayerColor(leadIdx, leadWinner.color);
    const isTie = winners.length > 1;
    const stageName = getStageDef(state.mapId as StageId).name;
    const dateLabel = formatCalendarDate(state.month, state.year);

    // Header
    const header = mk('div', 'setup-header victory-header');
    const headLeft = mk('div', 'victory-header-title');
    headLeft.append(
      mk('span', 'victory-trophy-icon', '🏆'),
      mk('h2', 'setup-title', 'Match Complete!')
    );
    const headActions = mk('div', 'victory-header-actions');
    headActions.append(
      mkBtn('🔊 Replay Fanfare', () => options.onReplayFanfare(resolveWinReason(options.getState()))),
      mkBtn('Close (Esc)', close)
    );
    header.append(headLeft, headActions);

    // Celebration Hero Banner
    const hero = mk('div', 'victory-hero');
    hero.style.setProperty('--winner-color', leadDisplayColor);
    const confetti = mk('div', 'victory-confetti-layer');
    confetti.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 18; i++) {
      const piece = mk('span', 'victory-confetti');
      piece.style.left = `${4 + ((i * 5.3) % 92)}%`;
      piece.style.backgroundColor = CONFETTI_COLORS[i % CONFETTI_COLORS.length]!;
      piece.style.animationDelay = `${(i % 6) * 0.14}s`;
      piece.style.animationDuration = `${2.2 + (i % 4) * 0.35}s`;
      confetti.appendChild(piece);
    }

    const avatarsRow = mk('div', 'victory-avatars-row');
    for (const w of winners) {
      const wIdx = Math.max(0, state.players.findIndex((p) => p.id === w.id));
      const wColor = getDisplayPlayerColor(wIdx, w.color);
      const avatarFrame = mk('div', `victory-avatar-frame${isTie ? ' is-compact' : ''}`);
      avatarFrame.style.borderColor = wColor;
      avatarFrame.appendChild(mk('span', 'victory-crown-badge', '👑'));
      avatarFrame.appendChild(
        createAvatarElement(resolvePlayerAvatar(state, wIdx, online.roster, online.customAvatars), wColor)
      );
      avatarsRow.appendChild(avatarFrame);
    }

    const heroInfo = mk('div', 'victory-hero-info');
    const winTitle = mk(
      'div',
      'victory-winner-name',
      isTie ? `${formatWinnerNames(winners)} Tie for 1st!` : `${leadWinner.name} Wins!`
    );
    if (!isTie) winTitle.style.color = leadDisplayColor;
    const reasonPill = mk('span', 'victory-reason-pill', '');
    setMoneyText(reasonPill, resolveWinHeadline(state), 'asset');
    const assetsLabel = isTie ? 'Tied Final Assets' : 'Final Assets';
    const meta = mk('div', 'victory-hero-meta', '');
    setMoneyText(
      meta,
      `${stageName} · ${dateLabel} · ${state.turnNumber} turns · ${assetsLabel}: ${formatDollars(computePlayerNetWorth(state, leadWinner.id))}`,
      'asset'
    );
    heroInfo.append(winTitle, reasonPill, meta);
    hero.append(confetti, avatarsRow, heroInfo);

    // Scrollable Body
    const body = mk('div', 'lobby-body victory-body');
    body.appendChild(hero);

    const chartSec = addLobbySection('Net Worth History (Monthly)');
    chartSec.appendChild(createVictoryChart(state));
    body.appendChild(chartSec);

    const awards = computeMatchAwards(state);
    if (awards.length > 0) {
      const awardsSec = addLobbySection('Match Awards');
      const grid = mk('div', 'victory-awards-grid');
      for (const award of awards) {
        const card = mk('div', 'victory-award-card');
        card.title = award.subtitle;
        const top = mk('div', 'victory-award-top');
        const valSpan = mk('span', 'victory-award-val', '');
        setMoneyText(valSpan, award.valueLabel);
        top.append(
          mk('span', 'victory-award-icon', award.icon),
          mk('strong', 'victory-award-title', award.title),
          valSpan
        );
        const winnersLine = mk('div', 'victory-award-winners');
        award.winnerIds.forEach((id, idx) => {
          const pIdx = state.players.findIndex((pl) => pl.id === id);
          const p = pIdx >= 0 ? state.players[pIdx] : undefined;
          if (!p) return;
          if (idx > 0) winnersLine.appendChild(mk('span', 'victory-award-sep', ', '));
          const span = mk('span', 'victory-award-player', p.name);
          span.style.color = getDisplayPlayerColor(pIdx, p.color);
          winnersLine.appendChild(span);
        });
        card.append(top, winnersLine, mk('div', 'victory-award-sub', award.subtitle));
        grid.appendChild(card);
      }
      awardsSec.appendChild(grid);
      body.appendChild(awardsSec);
    }

    const statsSec = addLobbySection('Final Standings & Match Stats');
    const tabBar = mk('div', 'victory-tabs');
    const tableHost = mk('div', '');

    const tabs: Array<[StatsTabId, string]> = [
      ['overview', 'Overview'],
      ['retail', 'Retail & Stores'],
      ['travel', 'Travel, Bank & Events'],
    ];

    const renderTabBody = () => {
      for (const btn of Array.from(tabBar.querySelectorAll<HTMLButtonElement>('button'))) {
        btn.classList.toggle('primary', btn.dataset.tab === activeTab);
      }
      tableHost.innerHTML = '';
      tableHost.appendChild(buildStatsTable(state, rankedRows, activeTab, online));
    };

    for (const [id, label] of tabs) {
      const btn = mkBtn(label, () => {
        activeTab = id;
        renderTabBody();
      });
      btn.dataset.tab = id;
      tabBar.appendChild(btn);
    }

    renderTabBody();
    statsSec.append(tabBar, tableHost);
    body.appendChild(statsSec);

    // Footer
    const footer = mk('div', 'setup-footer victory-footer');
    const leftNote = mk(
      'span',
      'setup-muted',
      online.role === 'guest'
        ? 'Waiting for host to start a new match…'
        : 'Review stats or start a new game.'
    );
    const footerBtns = mk('div', 'victory-footer-actions');
    footerBtns.appendChild(mkBtn('Inspect Board', close));
    if (online.role !== 'guest') {
      footerBtns.appendChild(
        mkBtn('Match Setup', () => {
          close();
          options.onOpenSetup();
        })
      );
      footerBtns.appendChild(
        mkBtn(
          'Rematch (Same Setup)',
          () => {
            close();
            options.onRematch();
          },
          'primary'
        )
      );
    }
    footer.append(leftNote, footerBtns);

    modal.append(header, body, footer);
  };

  return {
    el: backdrop,
    open: () => {
      activeTab = 'overview';
      visible = true;
      render();
      backdrop.hidden = false;
    },
    close,
    isOpen: () => visible,
    refresh: () => {
      if (visible) render();
    },
  };
}
