import { BANK_REWARDS, DEFAULT_MATCH_CONFIG, EVENT_CARDS, PLAYER_COLORS } from '../config/balance';
import { createTestMap, START_TILE_ID } from '../config/testMap';
import type { GameAction } from './actions';
import { advanceToNextTurn, appendLog, getActivePlayer } from './helpers';
import {
  handleAdvanceStep,
  handleCancelMove,
  handleChooseDirection,
  handleResolveElevator,
  handleRollPencil,
  handleUndoStep,
} from './movement';
import { pickRandom } from './rng';
import {
  handleBuyoutShop,
  handleBuyRivalItems,
  handleDeliverItems,
  handleOpenShop,
  handleSellShopLiquidate,
  resumeAfterPostAction,
} from './shops';
import type { GameState, MatchConfig, Player, Shop } from './types';

export interface PlayerSetupInput {
  name: string;
  isBot?: boolean;
}

export function createInitialGameState(
  playerInputs: PlayerSetupInput[],
  configOverrides: Partial<MatchConfig> = {},
  seed = 1337
): GameState {
  const config: MatchConfig = { ...DEFAULT_MATCH_CONFIG, ...configOverrides };
  const { tiles, shops } = createTestMap();

  const players: Player[] = playerInputs.map((input, idx) => ({
    id: `p_${idx + 1}`,
    name: input.name.trim() || `Player ${idx + 1}`,
    color: PLAYER_COLORS[idx % PLAYER_COLORS.length] ?? '#ffffff',
    cash: config.startingCash,
    points: 0,
    tileId: START_TILE_ID,
    horizontalDir: null,
    verticalDir: null,
    stepsSincePayday: 0,
    blockDeliveryTurns: 0,
    blockNewStoreTurns: 0,
    isBankrupt: false,
    isBot: Boolean(input.isBot),
  }));

  return {
    seed,
    turnNumber: 1,
    roundStartPlayerIndex: 0,
    activePlayerIndex: 0,
    phase: 'ROLL_PENCIL',
    lastRoll: null,
    remainingSteps: 0,
    hadBranchChoiceThisTurn: false,
    moveHistory: [],
    pendingUndoSnapshot: null,
    pendingPostBankPhase: null,
    eventChoices: [],
    config,
    players,
    tiles,
    shops,
    winnerId: null,
    log: ['Match started at Floor 1 Bank.'],
  };
}

function handlePickEventCard(state: GameState, cardId: string): GameState {
  if (state.phase !== 'EVENT_PICK' || !state.eventChoices.includes(cardId)) {
    return state;
  }
  const card = EVENT_CARDS.find((c) => c.id === cardId);
  if (!card) return state;

  const active = getActivePlayer(state);
  let nextSeed = state.seed;
  let nextShops = state.shops;
  let cashDelta = 0;
  let unlockDir = false;
  let triggerRemoteDeliver = false;
  let detail = '';

  if (card.id === 'cash_bonus') {
    cashDelta = 300;
  } else if (card.id === 'tax_audit') {
    cashDelta = -200;
  } else if (card.id === 'free_direction') {
    unlockDir = true;
  } else if (card.id === 'close_random') {
    const rivalShops = Object.values(state.shops).filter(
      (s) => s.ownerId && s.ownerId !== active.id
    );
    if (rivalShops.length > 0) {
      const picked = pickRandom(nextSeed, rivalShops);
      nextSeed = picked.nextSeed;
      const target = picked.value;
      nextShops = {
        ...state.shops,
        [target.id]: { ...target, isClosedTurns: 2 },
      };
      detail = ' Closed a rival store for 2 turns.';
    }
  } else if (card.id === 'remote_stock') {
    const ownShops = Object.values(state.shops).filter((s) => s.ownerId === active.id);
    if (ownShops.length > 0 && active.blockDeliveryTurns === 0) {
      triggerRemoteDeliver = true;
    }
  }

  const players = state.players.map((p, idx) =>
    idx === state.activePlayerIndex
      ? {
          ...p,
          cash: p.cash + cashDelta,
          points: p.points + card.pointsAwarded,
          horizontalDir: unlockDir ? null : p.horizontalDir,
          verticalDir: unlockDir ? null : p.verticalDir,
        }
      : p
  );

  const updated: GameState = {
    ...state,
    seed: nextSeed,
    players,
    shops: nextShops,
    hadBranchChoiceThisTurn: false,
    moveHistory: [],
    pendingUndoSnapshot: null,
    eventChoices: [],
    log: appendLog(
      state,
      `${active.name} picked "${card.name}" (+${card.pointsAwarded} pts).${detail}`
    ),
  };

  if (triggerRemoteDeliver) {
    return { ...updated, phase: 'SHOP_DELIVER' };
  }
  return resumeAfterPostAction(updated);
}

function handleRedeemBankReward(
  state: GameState,
  rewardId: string,
  targetPlayerId?: string,
  targetShopId?: string
): GameState {
  if (state.phase !== 'BANK_MENU') return state;

  const reward = BANK_REWARDS.find((r) => r.id === rewardId);
  const active = getActivePlayer(state);
  if (!reward || active.points < reward.pointCost) return state;

  const ownShops = Object.values(state.shops).filter((s) => s.ownerId === active.id);
  if (reward.id === 'remote_deliver' && (ownShops.length === 0 || active.blockDeliveryTurns > 0)) {
    return state;
  }

  let nextPlayers = state.players.map((p, idx) =>
    idx === state.activePlayerIndex ? { ...p, points: p.points - reward.pointCost } : p
  );
  let nextShops: Record<string, Shop> = state.shops;

  if (reward.id === 'earn_point') {
    nextPlayers = nextPlayers.map((p, idx) =>
      idx === state.activePlayerIndex ? { ...p, points: p.points + 1 } : p
    );
  } else if (reward.id === 'cash_200') {
    nextPlayers = nextPlayers.map((p, idx) =>
      idx === state.activePlayerIndex ? { ...p, cash: p.cash + 250 } : p
    );
  } else if (reward.id === 'block_delivery' && targetPlayerId) {
    nextPlayers = nextPlayers.map((p) =>
      p.id === targetPlayerId ? { ...p, blockDeliveryTurns: p.blockDeliveryTurns + 2 } : p
    );
  } else if (reward.id === 'close_rival' && targetShopId && state.shops[targetShopId]) {
    const targetShop = state.shops[targetShopId]!;
    nextShops = { ...state.shops, [targetShopId]: { ...targetShop, isClosedTurns: 2 } };
  } else if (reward.id === 'win_game') {
    return {
      ...state,
      players: nextPlayers,
      phase: 'GAME_OVER',
      winnerId: active.id,
      log: appendLog(state, `${active.name} bought Mall Monopoly and won!`),
    };
  }

  const nextState: GameState = {
    ...state,
    players: nextPlayers,
    shops: nextShops,
    hadBranchChoiceThisTurn: false,
    moveHistory: [],
    pendingUndoSnapshot: null,
    log: appendLog(state, `${active.name} redeemed "${reward.label}".`),
  };

  if (reward.id === 'remote_deliver') {
    return { ...nextState, phase: 'SHOP_DELIVER' };
  }
  return resumeAfterPostAction(nextState);
}

function handleCloseBankMenu(state: GameState): GameState {
  if (state.phase !== 'BANK_MENU') return state;
  return resumeAfterPostAction(state);
}

export function applyAction(state: GameState, action: GameAction): GameState {
  if (state.phase === 'GAME_OVER') return state;

  switch (action.type) {
    case 'ROLL_PENCIL':
      return handleRollPencil(state);
    case 'CHOOSE_DIRECTION':
      return handleChooseDirection(state, action.direction);
    case 'ADVANCE_STEP':
      return handleAdvanceStep(state);
    case 'UNDO_STEP':
      return handleUndoStep(state);
    case 'CANCEL_MOVE':
      return handleCancelMove(state);
    case 'RESOLVE_ELEVATOR':
      return handleResolveElevator(state, action.ride);
    case 'PICK_EVENT_CARD':
      return handlePickEventCard(state, action.cardId);
    case 'REDEEM_BANK_REWARD':
      return handleRedeemBankReward(
        state,
        action.rewardId,
        action.targetPlayerId,
        action.targetShopId
      );
    case 'CLOSE_BANK_MENU':
      return handleCloseBankMenu(state);
    case 'OPEN_SHOP':
      return handleOpenShop(state, action.storeTypeId);
    case 'BUYOUT_SHOP':
      return handleBuyoutShop(state, action.storeTypeId);
    case 'SKIP_SHOP_SLOT':
      return state.phase === 'SHOP_BUY_SLOT' ? resumeAfterPostAction(state) : state;
    case 'DELIVER_ITEMS':
      return handleDeliverItems(state, action.shopId, action.order);
    case 'SKIP_DELIVER':
      return state.phase === 'SHOP_DELIVER' ? resumeAfterPostAction(state) : state;
    case 'BUY_RIVAL_ITEMS':
      return handleBuyRivalItems(state, action.itemIds);
    case 'SELL_SHOP_LIQUIDATE':
      return handleSellShopLiquidate(state, action.shopId);
    case 'END_TURN':
      return advanceToNextTurn(state);
    default:
      return state;
  }
}