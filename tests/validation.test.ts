import { describe, expect, it } from 'vitest';
import { createSpeciesPreset, getDefaultAvatarForSeat, isValidAvatarSpec } from '../src/config/avatarTypes';
import { isValidGameAction } from '../src/engine/actions';
import { createInitialGameState } from '../src/engine/state';
import { createAvatarSyncStore } from '../src/net/avatarSync';
import {
  createDefaultRoster,
  generateRoomCode,
  HOST_TOKEN,
  isValidClientMessage,
  isValidHostMessage,
  ROOM_CODE_ALPHABET,
} from '../src/net/protocol';
import {
  createDefaultMatchSetup,
  isValidGameState,
  parseAutoSavedMatch,
  parseManualMatchEnvelope,
  sanitizeMatchSetup,
  SAVE_SCHEMA_VERSION,
} from '../src/ui/persistence';

const ENGINE_SOURCES = import.meta.glob('../src/engine/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
});

describe('action validation, persistence sanitization, and engine purity', () => {
  it('validates game actions and rejects malformed or prototype-polluting payloads', () => {
    expect(isValidGameAction({ type: 'ROLL_PENCIL', chosenFace: 'E' })).toBe(true);
    expect(isValidGameAction({ type: 'REVEAL_EVENT_CARD', slotIndex: 2 })).toBe(true);
    expect(isValidGameAction({ type: 'BUY_RIVAL_ITEMS', itemIds: ['a'] })).toBe(true);
    expect(isValidGameAction({ type: 'FINISH_RIVAL_SHOP' })).toBe(true);
    expect(isValidGameAction({ type: 'DELIVER_ITEMS', shopId: 'shop_1_1', order: { item_1: 2 } })).toBe(true);
    expect(isValidGameAction({ type: 'RESOLVE_SHOES', mode: 'keep' })).toBe(true);
    expect(isValidGameAction({ type: 'RESOLVE_SHOES', mode: 'stack', style: 'honk' })).toBe(true);
    expect(isValidGameAction({ type: 'RESOLVE_SHOES', mode: 'replace', style: 'boing', slotIndex: 1 })).toBe(true);
    expect(isValidGameAction({ type: 'RESOLVE_SHOES', mode: 'clear' })).toBe(true);

    expect(isValidGameAction({ type: 'REVEAL_EVENT_CARD', slotIndex: 3 })).toBe(false);
    expect(isValidGameAction({ type: 'RESOLVE_SHOES', mode: 'stack', style: 'bad_style' })).toBe(false);
    expect(isValidGameAction({ type: 'RESOLVE_SHOES', mode: 'replace', style: 'honk', slotIndex: 3 })).toBe(false);
    expect(isValidClientMessage({ type: 'UI_TURN_PING', clientToken: 'tok_12345' })).toBe(true);
    expect(
      isValidHostMessage({ type: 'UI_TURN_PING', fromName: 'Alice', targetPlayerId: 'p_2', targetPlayerName: 'Bob' })
    ).toBe(true);
    expect(isValidAvatarSpec(createSpeciesPreset('robin'))).toBe(true);
    expect(isValidAvatarSpec(createSpeciesPreset('koi'))).toBe(true);
    expect(isValidAvatarSpec(createSpeciesPreset('dolphin'))).toBe(true);
    expect(isValidGameAction({ type: 'BUY_RIVAL_ITEMS', itemIds: ['a', 'b'] })).toBe(false);
    expect(isValidGameAction({ type: 'BUY_RIVAL_ITEMS', itemIds: [] })).toBe(false);
    expect(isValidGameAction({ type: 'DELIVER_ITEMS', shopId: 'shop_1_1', order: { item_1: -1 } })).toBe(false);
    expect(
      isValidGameAction({
        type: 'DELIVER_ITEMS',
        shopId: 'shop_1_1',
        order: JSON.parse('{"__proto__": 1}'),
      })
    ).toBe(false);
    expect(isValidGameAction({ type: 'UNKNOWN_ACTION' })).toBe(false);

    expect(isValidClientMessage({ type: 'UI_PENCIL_SPIN', clientToken: 'tok_12345', spinning: true })).toBe(true);
    expect(isValidClientMessage({ type: 'UI_PENCIL_SPIN', clientToken: 'tok_12345', spinning: false, stopFace: 6 })).toBe(true);
    expect(isValidClientMessage({ type: 'UI_PENCIL_SPIN', clientToken: 'tok_12345', spinning: false, stopFace: 'E' })).toBe(true);
    expect(isValidClientMessage({ type: 'UI_PENCIL_SPIN', clientToken: 'tok_12345', spinning: false, stopFace: 9 })).toBe(false);
    expect(isValidClientMessage({ type: 'HELLO', clientToken: HOST_TOKEN, name: 'Spoof', color: '#3498db' })).toBe(false);
    expect(isValidClientMessage({ type: 'HELLO', clientToken: 'short', name: 'Short', color: '#3498db' })).toBe(false);
    expect(isValidHostMessage({ type: 'UI_PENCIL_SPIN', spinning: false, activePlayerIndex: 0, stopFace: 4 })).toBe(true);
    expect(isValidHostMessage({ type: 'UI_PENCIL_SPIN', spinning: false, activePlayerIndex: 0, stopFace: 'X' })).toBe(false);

    const sampleRoster = createDefaultRoster('ROOM42', 2);
    const sampleState = createInitialGameState([{ name: 'A' }, { name: 'B' }], {}, 1, 'stage_0');
    expect(
      isValidHostMessage({ type: 'WELCOME', seq: 1, roster: sampleRoster, state: { ...sampleState, players: [] } })
    ).toBe(false);
    expect(
      isValidHostMessage({ type: 'WELCOME', seq: 1, myPeerId: HOST_TOKEN, roster: sampleRoster, state: sampleState })
    ).toBe(false);

    for (let i = 0; i < 10; i++) {
      const code = generateRoomCode();
      expect(code).toHaveLength(6);
      for (const ch of code) {
        expect(ROOM_CODE_ALPHABET.includes(ch)).toBe(true);
      }
    }

    const sampleImg = `data:image/webp;base64,${'A'.repeat(40)}`;
    expect(isValidHostMessage({ type: 'AVATAR_PUT', key: 'p_1', dataUrl: sampleImg })).toBe(true);
    expect(isValidHostMessage({ type: 'AVATAR_PUT', key: 'p_1', dataUrl: null })).toBe(true);
    expect(isValidHostMessage({ type: 'AVATAR_PUT', key: '__proto__', dataUrl: sampleImg })).toBe(false);
    expect(isValidHostMessage({ type: 'AVATAR_PUT', key: 'p_1', dataUrl: 'data:image/svg+xml;base64,AAA' })).toBe(false);
  });

  it('computes incremental AVATAR_PUT diffs and applies remote puts safely', () => {
    const imgA = `data:image/webp;base64,${'A'.repeat(40)}`;
    const imgB = `data:image/webp;base64,${'B'.repeat(40)}`;
    const hostStore = createAvatarSyncStore();
    const guestStore = createAvatarSyncStore();
    const roster = {
      ...createDefaultRoster('ROOM42', 2),
      peers: [{ id: 'guest_1', name: 'Bob', color: '#3498db', connected: true }],
    };
    const stateWithImg = createInitialGameState(
      [{ name: 'Alice', avatar: { ...getDefaultAvatarForSeat(0), customImage: imgA } }, { name: 'Bob' }],
      {},
      1,
      'stage_0'
    );

    const first = hostStore.refreshHostMap(stateWithImg, roster);
    expect(first.diffs).toEqual([{ key: 'p_1', dataUrl: imgA }]);
    for (const d of first.diffs) expect(guestStore.applyRemotePut(d.key, d.dataUrl)).toBe(true);
    expect(guestStore.getMap()).toEqual({ p_1: imgA });

    const noop = hostStore.refreshHostMap(stateWithImg, roster);
    expect(noop.changed).toBe(false);
    expect(noop.diffs).toEqual([]);

    hostStore.setPeerImage('guest_1', imgB);
    const addedPeer = hostStore.refreshHostMap(stateWithImg, roster);
    expect(addedPeer.diffs).toEqual([{ key: 'guest_1', dataUrl: imgB }]);
    for (const d of addedPeer.diffs) expect(guestStore.applyRemotePut(d.key, d.dataUrl)).toBe(true);
    expect(guestStore.getMap()).toEqual({ p_1: imgA, guest_1: imgB });

    hostStore.removePeerImage('guest_1');
    const removedPeer = hostStore.refreshHostMap(stateWithImg, roster);
    expect(removedPeer.diffs).toEqual([{ key: 'guest_1', dataUrl: null }]);
    for (const d of removedPeer.diffs) expect(guestStore.applyRemotePut(d.key, d.dataUrl)).toBe(true);
    expect(guestStore.getMap()).toEqual({ p_1: imgA });
    expect(guestStore.applyRemotePut('guest_1', null)).toBe(false);
    expect(guestStore.applyRemotePut('__proto__', imgA)).toBe(false);
  });

  it('applies per-stage recommended defaults and validates serialized game states', () => {
    const s7 = createDefaultMatchSetup(3, 'stage_6');
    expect(s7.players).toHaveLength(3);
    expect(s7.config.startingCash).toBe(4200);
    expect(s7.config.targetAssets).toBe(24000);

    const sanitized = sanitizeMatchSetup({
      stageId: 'stage_9',
      players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
      config: { targetAssets: 99999999, startingCash: 100, bankruptLimit: 99 },
    });
    expect(sanitized).not.toBeNull();
    expect(sanitized!.config.targetAssets).toBe(1000000);
    expect(sanitized!.config.startingCash).toBe(500);
    expect(sanitized!.config.bankruptLimit).toBe(2);

    const state = createInitialGameState([{ name: 'A' }, { name: 'B' }], {}, 1, 'stage_0');
    expect(isValidGameState(state)).toBe(true);

    const p8 = createInitialGameState(
      Array.from({ length: 8 }, (_, i) => ({ name: `P${i + 1}` })),
      {},
      1,
      'stage_3'
    );
    expect(p8.players).toHaveLength(8);
    expect(isValidGameState(p8)).toBe(true);
    expect(sanitizeMatchSetup({ stageId: 'stage_3', players: Array.from({ length: 8 }, (_, i) => ({ name: `P${i + 1}` })) })?.players).toHaveLength(8);
    expect(isValidGameState({ ...p8, players: [...p8.players, p8.players[0]!] })).toBe(false);

    expect(isValidGameState({ ...state, mapId: 'stage_999' })).toBe(false);
    expect(isValidGameState({ ...state, activePlayerIndex: 5 })).toBe(false);
    expect(
      isValidGameState({
        ...state,
        players: [{ ...state.players[0]!, tileId: 'bad_tile' }, state.players[1]!],
      })
    ).toBe(false);
    expect(isValidGameState({ ...state, phase: 'BAD_PHASE' })).toBe(false);
    expect(
      isValidGameState({
        ...state,
        players: [{ ...state.players[0]!, cash: Number.NaN }, state.players[1]!],
      })
    ).toBe(false);
    const firstShopKey = Object.keys(state.shops)[0]!;
    expect(
      isValidGameState({
        ...state,
        shops: { ...state.shops, [firstShopKey]: { ...state.shops[firstShopKey]!, level: 9 } },
      })
    ).toBe(false);

    expect(parseAutoSavedMatch({ schemaVersion: SAVE_SCHEMA_VERSION, state })).toEqual(state);
    expect(parseAutoSavedMatch(state)).toBeNull();
    expect(parseAutoSavedMatch({ schemaVersion: 0, state })).toBeNull();
    expect(parseAutoSavedMatch({ schemaVersion: SAVE_SCHEMA_VERSION + 1, state })).toBeNull();

    const manual = { schemaVersion: SAVE_SCHEMA_VERSION, savedAt: '2026-11-24T12:00:00.000Z', state };
    expect(parseManualMatchEnvelope(manual)).toEqual(manual);
    expect(parseManualMatchEnvelope({ savedAt: '2026-11-24T12:00:00.000Z', state })).toBeNull();
    expect(parseManualMatchEnvelope({ ...manual, schemaVersion: SAVE_SCHEMA_VERSION + 1 })).toBeNull();
    expect(
      isValidGameState({
        ...state,
        shops: {
          ...state.shops,
          [firstShopKey]: {
            ...state.shops[firstShopKey]!,
            closedWindow: { castAt: 3, expiresAt: 1, casterId: 'p_1' },
          },
        },
      })
    ).toBe(false);
    expect(
      isValidGameState({
        ...state,
        phase: 'EVENT_SHOES_CHOICE',
        players: state.players.map((p, i) => (i === 0 ? { ...p, equippedWalkSounds: ['chirp', 'honk'] } : p)),
      })
    ).toBe(true);
    expect(
      isValidGameState({
        ...state,
        players: state.players.map((p, i) =>
          i === 0 ? { ...p, equippedWalkSounds: ['chirp', 'honk', 'boing', 'tap'] as never } : p
        ),
      })
    ).toBe(false);
    expect(
      isValidGameState({
        ...state,
        globalSale: {
          label: 'Bad Sale',
          priceMultiplier: 0.5,
          timer: { castAt: -1, expiresAt: 2, casterId: 'p_1' },
        },
      })
    ).toBe(false);
  });

  it('guards GameState, Player, and Shop schema keys against SAVE_SCHEMA_VERSION', () => {
    const schemaHint = 'GameState/Player/Shop keys changed — update src/ui/stateValidation.ts and bump SAVE_SCHEMA_VERSION.';
    expect(SAVE_SCHEMA_VERSION).toBe(3);

    const state = createInitialGameState([{ name: 'A' }, { name: 'B' }], {}, 1, 'stage_0');
    expect(Object.keys(state).sort(), schemaHint).toEqual([
      'activePlayerIndex',
      'assetHistory',
      'config',
      'deliverMode',
      'deliverPreferredShopId',
      'deliveredShopIdsThisTurn',
      'elevatorLock',
      'eventChoices',
      'eventStorePrompt',
      'globalSale',
      'hadBranchChoiceThisTurn',
      'lastPurchaseReceipt',
      'lastRoll',
      'log',
      'mapId',
      'matchStats',
      'month',
      'moveHistory',
      'pendingBankRefundPts',
      'pendingPostBankPhase',
      'pendingUndoSnapshot',
      'phase',
      'players',
      'remainingSteps',
      'revealedEventSlot',
      'rivalItemsBoughtThisTurn',
      'roundStartPlayerIndex',
      'seed',
      'segmentPools',
      'shops',
      'tiles',
      'totalMonths',
      'turnNumber',
      'winReason',
      'winnerId',
      'year',
    ]);
    expect(Object.keys(state.players[0]!).sort(), schemaHint).toEqual([
      'bankVisits',
      'blockDeliveryWindow',
      'blockNewStoreWindow',
      'cash',
      'chirpSandals',
      'color',
      'doubleNextPayday',
      'doublePriceWindow',
      'horizontalDir',
      'id',
      'isBankrupt',
      'isBot',
      'name',
      'pencilMode',
      'pencilWindow',
      'points',
      'reverseDirNextTurn',
      'skipNextPayday',
      'stepsSincePayday',
      'tileId',
      'unlockDirNextTurn',
      'verticalDir',
    ]);
    expect(Object.keys(Object.values(state.shops)[0]!).sort(), schemaHint).toEqual([
      'closedWindow',
      'id',
      'level',
      'ownerId',
      'segmentId',
      'stock',
      'storeTypeId',
      'tileId',
    ]);
  });

  it('keeps src/engine completely free of browser and DOM references', () => {
    const entries = Object.entries(ENGINE_SOURCES);
    expect(entries.length).toBeGreaterThan(0);

    const browserPattern = /\b(window|document|HTMLElement|localStorage|sessionStorage)\b/;
    for (const [filePath, contents] of entries) {
      expect(String(contents), `Unexpected browser reference in ${filePath}`).not.toMatch(browserPattern);
    }
  });
});
