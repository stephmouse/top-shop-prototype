import { describe, expect, it } from 'vitest';
import { isValidGameAction } from '../src/engine/actions';
import { createInitialGameState } from '../src/engine/state';
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
    expect(isValidGameAction({ type: 'BUY_RIVAL_ITEMS', itemIds: ['a', 'b'] })).toBe(true);
    expect(isValidGameAction({ type: 'DELIVER_ITEMS', shopId: 'shop_1_1', order: { item_1: 2 } })).toBe(true);

    expect(isValidGameAction({ type: 'REVEAL_EVENT_CARD', slotIndex: 3 })).toBe(false);
    expect(isValidGameAction({ type: 'BUY_RIVAL_ITEMS', itemIds: ['a', 'b', 'c'] })).toBe(false);
    expect(isValidGameAction({ type: 'DELIVER_ITEMS', shopId: 'shop_1_1', order: { item_1: -1 } })).toBe(false);
    expect(
      isValidGameAction({
        type: 'DELIVER_ITEMS',
        shopId: 'shop_1_1',
        order: JSON.parse('{"__proto__": 1}'),
      })
    ).toBe(false);
    expect(isValidGameAction({ type: 'UNKNOWN_ACTION' })).toBe(false);
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
