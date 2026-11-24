import { describe, expect, it } from 'vitest';
import { getDefaultAvatarForSeat } from '../src/config/avatarTypes';
import { isValidGameAction } from '../src/engine/actions';
import { createInitialGameState } from '../src/engine/state';
import { createAvatarSyncStore } from '../src/net/avatarSync';
import { createDefaultRoster, isValidClientMessage, isValidHostMessage } from '../src/net/protocol';
import { createDefaultMatchSetup, isValidGameState, sanitizeMatchSetup } from '../src/ui/persistence';

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

    expect(isValidGameAction({ type: 'REVEAL_EVENT_CARD', slotIndex: 3 })).toBe(false);
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
    expect(isValidHostMessage({ type: 'UI_PENCIL_SPIN', spinning: false, activePlayerIndex: 0, stopFace: 4 })).toBe(true);
    expect(isValidHostMessage({ type: 'UI_PENCIL_SPIN', spinning: false, activePlayerIndex: 0, stopFace: 'X' })).toBe(false);

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
      peers: [{ clientToken: 'peer_1', peerId: 'pid_1', name: 'Bob', color: '#3498db', connected: true }],
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

    hostStore.setPeerImage('peer_1', imgB);
    const addedPeer = hostStore.refreshHostMap(stateWithImg, roster);
    expect(addedPeer.diffs).toEqual([{ key: 'peer_1', dataUrl: imgB }]);
    for (const d of addedPeer.diffs) expect(guestStore.applyRemotePut(d.key, d.dataUrl)).toBe(true);
    expect(guestStore.getMap()).toEqual({ p_1: imgA, peer_1: imgB });

    hostStore.removePeerImage('peer_1');
    const removedPeer = hostStore.refreshHostMap(stateWithImg, roster);
    expect(removedPeer.diffs).toEqual([{ key: 'peer_1', dataUrl: null }]);
    for (const d of removedPeer.diffs) expect(guestStore.applyRemotePut(d.key, d.dataUrl)).toBe(true);
    expect(guestStore.getMap()).toEqual({ p_1: imgA });
    expect(guestStore.applyRemotePut('peer_1', null)).toBe(false);
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
    expect(isValidGameState({ ...state, mapId: 'stage_999' })).toBe(false);
    expect(isValidGameState({ ...state, activePlayerIndex: 5 })).toBe(false);
    expect(
      isValidGameState({
        ...state,
        players: [{ ...state.players[0]!, tileId: 'bad_tile' }, state.players[1]!],
      })
    ).toBe(false);
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
