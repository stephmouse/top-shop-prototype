import { describe, expect, it } from 'vitest';
import { STORE_TYPES } from '../src/config/balance';
import {
  getShopDisplayName,
  getShopDisplayVisual,
  getShopItemDisplayName,
  isValidSignatureStore,
  sanitizeSignatureStore,
} from '../src/config/signatureStore';
import type { SignatureStoreSpec } from '../src/config/signatureStore';
import { redactStateForClient } from '../src/engine/actions';
import { applyAction, createInitialGameState } from '../src/engine/state';
import {
  getPlayerActiveSignatureSegment,
  getSegmentHighValueStoreTypeId,
  getSignatureOpenEligibility,
} from '../src/engine/shops';
import { createHostRouter } from '../src/net/hostRouter';
import type { HostPeerSender } from '../src/net/hostRouter';
import type { HostToClientMessage } from '../src/net/protocol';

const SIG_ALICE: SignatureStoreSpec = {
  name: 'Starlight Emporium',
  iconId: 'sparkles',
  accent: '#facc15',
  itemNames: ['Glow Key', 'Nebula Tea', 'Comet Pin', 'Prism Lamp', 'Astro Jacket', 'Crown Tiara'],
};

const SIG_BOB: SignatureStoreSpec = {
  name: 'Pixel Palace',
  iconId: 'gamepad',
  accent: '#38bdf8',
  itemNames: ['Coin Token', 'Chiptune', '', '', '', 'Gold Console'],
};

describe('Signature Store Sanitization & Display Resolvers', () => {
  it('sanitizes names, length caps, accents, icons, and empty-disabled specs', () => {
    expect(sanitizeSignatureStore(undefined)).toBeUndefined();
    expect(sanitizeSignatureStore({ name: '   ', iconId: 'sparkles', accent: '#ffffff', itemNames: [] })).toBeUndefined();

    const clean = sanitizeSignatureStore({
      name: '  A Very Long Store Name That Exceeds Limit  ',
      iconId: 'not_an_icon',
      accent: 'invalid',
      itemNames: ['Tiny', '  ', 'TwentyTwoCharsMaxLimit999', 123, '', 'Last'],
    });
    expect(clean).toEqual({
      name: 'A Very Long Store Name T',
      iconId: 'sparkles',
      accent: '#facc15',
      itemNames: ['Tiny', '', 'TwentyTwoCharsMaxLimit', '', '', 'Last'],
    });
    expect(isValidSignatureStore(clean)).toBe(true);
    expect(isValidSignatureStore(SIG_ALICE)).toBe(true);
  });

  it('resolves custom shop name, icon, accent, and cheapest-to-costliest item names', () => {
    const baseState = createInitialGameState(
      [
        { name: 'Alice', signatureStore: SIG_ALICE },
        { name: 'Bob', signatureStore: SIG_BOB },
      ],
      {},
      42
    );
    const [seg0Id] = Object.keys(baseState.segmentPools);
    const segPool = baseState.segmentPools[seg0Id!]!;
    const typeId = segPool[0]!;
    const def = STORE_TYPES[typeId]!;
    const sorted = [...def.items].sort((a, b) => a.retailPrice - b.retailPrice);
    const sigShop = {
      ...Object.values(baseState.shops)[0]!,
      ownerId: 'p_1',
      storeTypeId: typeId,
      signatureOwnerId: 'p_1',
    };
    const normalShop = { ...sigShop, signatureOwnerId: null };

    expect(getShopDisplayName(sigShop, baseState.players)).toBe('Starlight Emporium');
    expect(getShopDisplayName(normalShop, baseState.players)).toBe(def.name);
    expect(getShopDisplayVisual(sigShop, baseState.players)).toMatchObject({
      iconId: 'sparkles',
      accent: '#facc15',
      isSignature: true,
    });
    expect(getShopItemDisplayName(sigShop, sorted[0]!, baseState.players)).toBe('Glow Key');
    expect(getShopItemDisplayName(sigShop, sorted[5]!, baseState.players)).toBe('Crown Tiara');

    // Blank item slots fall back to real PS1 item names
    const bobShop = { ...sigShop, ownerId: 'p_2', signatureOwnerId: 'p_2' };
    expect(getShopItemDisplayName(bobShop, sorted[0]!, baseState.players)).toBe('Coin Token');
    expect(getShopItemDisplayName(bobShop, sorted[2]!, baseState.players)).toBe(sorted[2]!.name);
    expect(getShopItemDisplayName(bobShop, sorted[5]!, baseState.players)).toBe('Gold Console');
  });
});

describe('Signature Store Engine Mechanics', () => {
  it('opens as optional 4th choice, expands L2 in segment, blocks 2nd segment, and returns to pocket when lost', () => {
    let state = createInitialGameState(
      [
        { name: 'Alice', signatureStore: SIG_ALICE },
        { name: 'Bob', signatureStore: SIG_BOB },
      ],
      { startingCash: 50000 },
      100
    );
    const [seg0Id, seg1Id] = Object.keys(state.segmentPools) as [string, string];
    const seg0Shops = Object.values(state.shops).filter((s) => s.segmentId === seg0Id);
    const seg1Shops = Object.values(state.shops).filter((s) => s.segmentId === seg1Id);
    expect(seg0Shops.length).toBeGreaterThanOrEqual(2);
    expect(seg1Shops.length).toBeGreaterThanOrEqual(1);

    const hv0 = getSegmentHighValueStoreTypeId(state, seg0Id)!;
    const low0 = state.segmentPools[seg0Id]!.find((id) => id !== hv0)!;

    // Rejects opening Signature Store using a non-high-value store type
    const badState = applyAction(
      {
        ...state,
        phase: 'SHOP_BUY_SLOT',
        players: state.players.map((p, i) => (i === 0 ? { ...p, tileId: seg0Shops[0]!.tileId } : p)),
      },
      { type: 'OPEN_SHOP', storeTypeId: low0, asSignature: true }
    );
    expect(badState.shops[seg0Shops[0]!.id]!.ownerId).toBeNull();

    // Open slot 0 as Signature Store
    state = applyAction(
      {
        ...state,
        phase: 'SHOP_BUY_SLOT',
        players: state.players.map((p, i) => (i === 0 ? { ...p, tileId: seg0Shops[0]!.tileId } : p)),
      },
      { type: 'OPEN_SHOP', storeTypeId: hv0, asSignature: true }
    );
    expect(state.shops[seg0Shops[0]!.id]!.signatureOwnerId).toBe('p_1');
    expect(state.shops[seg0Shops[0]!.id]!.storeTypeId).toBe(hv0);
    expect(getPlayerActiveSignatureSegment(state, 'p_1')).toBe(seg0Id);

    // Cannot open a second Signature Store in seg1Id while seg0Id holds it
    expect(getSignatureOpenEligibility(state, 'p_1', seg1Id).canOpenAsSignature).toBe(false);
    // Same-segment adjacent expansion IS allowed as Signature Store
    expect(getSignatureOpenEligibility(state, 'p_1', seg0Id).isExpandingSignature).toBe(true);

    // Liquidate slot 0 -> Signature Store returns to pocket cleanly
    state = applyAction(
      { ...state, phase: 'LIQUIDATE_ASSETS', activePlayerIndex: 0 },
      { type: 'SELL_SHOP_LIQUIDATE', shopId: seg0Shops[0]!.id }
    );
    expect(state.shops[seg0Shops[0]!.id]!.ownerId).toBeNull();
    expect(state.shops[seg0Shops[0]!.id]!.signatureOwnerId).toBeNull();
    expect(getPlayerActiveSignatureSegment(state, 'p_1')).toBeNull();
    expect(getSignatureOpenEligibility(state, 'p_1', seg1Id).canOpenAsSignature).toBe(true);
  });

  it('prompts Signature conversion after Bank capture of a rival top-value store and preserves L4 signature', () => {
    let state = createInitialGameState(
      [
        { name: 'Alice', signatureStore: SIG_ALICE },
        { name: 'Bob', signatureStore: SIG_BOB },
      ],
      { startingCash: 20000, targetAssets: 100000 },
      200
    );
    const [seg0Id] = Object.keys(state.segmentPools) as [string, ...string[]];
    const seg0Shops = Object.values(state.shops).filter((s) => s.segmentId === seg0Id);
    const hv0 = getSegmentHighValueStoreTypeId(state, seg0Id)!;
    const bobShop = { ...seg0Shops[0]!, ownerId: 'p_2', storeTypeId: hv0, signatureOwnerId: 'p_2', stock: {} };
    state = {
      ...state,
      phase: 'BANK_MENU',
      activePlayerIndex: 0,
      players: state.players.map((p, i) => (i === 0 ? { ...p, points: 50 } : p)),
      shops: { ...state.shops, [bobShop.id]: bobShop },
    };

    // Bank #15: Capture rival empty top-value store -> enters convert_signature prompt
    state = applyAction(state, {
      type: 'REDEEM_BANK_REWARD',
      rewardId: 'bank_15_capture_empty',
      targetPlayerId: 'p_2',
    });
    expect(state.shops[bobShop.id]!.ownerId).toBe('p_1');
    expect(state.shops[bobShop.id]!.signatureOwnerId).toBeNull();
    expect(state.phase).toBe('EVENT_PICK_STORE');
    expect(state.eventStorePrompt?.mode).toBe('convert_signature');
    expect(state.eventStorePrompt?.candidateShopIds).toEqual([bobShop.id]);

    // Convert captured store into Alice's Signature Store
    state = applyAction(state, { type: 'RESOLVE_EVENT_STORE', shopId: bobShop.id });
    expect(state.shops[bobShop.id]!.signatureOwnerId).toBe('p_1');
    expect(state.phase).toBe('ROLL_PENCIL');

    // Bank #48: Upgrade own store segment to L4 preserves signatureOwnerId across every slot
    state = applyAction(
      {
        ...state,
        phase: 'BANK_MENU',
        activePlayerIndex: 0,
        players: state.players.map((p, i) => (i === 0 ? { ...p, points: 90 } : p)),
      },
      { type: 'REDEEM_BANK_REWARD', rewardId: 'bank_48_upgrade_own_l4' }
    );
    for (const s of Object.values(state.shops)) {
      if (s.segmentId === seg0Id) {
        expect(s.ownerId).toBe('p_1');
        expect(s.signatureOwnerId).toBe('p_1');
      }
    }
  });
});

describe('Signature Store Zero-Byte Wire Redaction & Out-of-Band Network Sync', () => {
  it('strips player.signatureStore in redactStateForClient and syncs via SIGNATURE_SYNC / SIGNATURE_PUT', () => {
    const state = createInitialGameState(
      [
        { name: 'Alice', signatureStore: SIG_ALICE },
        { name: 'Bob' },
      ],
      {},
      99
    );

    const redacted = redactStateForClient(state);
    expect(redacted.players[0]!.signatureStore).toBeUndefined();

    const sentToPeer = new Map<string, unknown[]>();
    const broadcasts: unknown[] = [];
    let hostState = state;

    const router = createHostRouter('ABCDEF', hostState, {
      getState: () => hostState,
      onApplyHostAction: (action) => applyAction(hostState, action),
      onSyncHostState: (next) => {
        hostState = next;
      },
      onSessionChange: () => {},
      sendToPeer: (pid, msg) => {
        const list = sentToPeer.get(pid) ?? [];
        list.push(msg);
        sentToPeer.set(pid, list);
      },
      broadcast: (msg) => {
        broadcasts.push(msg);
      },
      closePeer: () => {},
    });

    const messages: HostToClientMessage[] = [];
    const sender: HostPeerSender = {
      boundPublicId: null,
      send: (msg) => messages.push(msg),
      close: () => {},
      onBind: (publicId) => {
        sender.boundPublicId = publicId;
      },
    };
    router.handleClientMessage(
      {
        type: 'HELLO',
        clientToken: 'tok_guest_sig1',
        name: 'Bob',
        color: '#2ecc71',
        signatureStore: SIG_BOB,
      },
      sender
    );

    // WELCOME wire payload omits signatureStore, while out-of-band SIGNATURE_SYNC delivers both Alice and Bob
    const welcome = messages.find((m) => m.type === 'WELCOME') as Extract<HostToClientMessage, { type: 'WELCOME' }>;
    expect(welcome.state.players[0]!.signatureStore).toBeUndefined();
    expect(welcome.state.players[1]!.signatureStore).toBeUndefined();

    const sigSync = messages.find((m) => m.type === 'SIGNATURE_SYNC') as Extract<
      HostToClientMessage,
      { type: 'SIGNATURE_SYNC' }
    >;
    expect(sigSync).toBeDefined();
    expect(sigSync.signatures.p_1).toEqual(SIG_ALICE);
    expect(sigSync.signatures.guest_1).toEqual(SIG_BOB);

    // Live UPDATE_PROFILE pushes a compact SIGNATURE_PUT diff without embedding strings in STATE_SYNC
    router.handleClientMessage(
      {
        type: 'UPDATE_PROFILE',
        clientToken: 'tok_guest_sig1',
        name: 'Bob',
        color: '#2ecc71',
        signatureStore: { ...SIG_BOB, name: 'Arcade Ultra' },
      },
      sender
    );
    expect(router.getSyncedSignatures().guest_1?.name).toBe('Arcade Ultra');
    expect(
      broadcasts.some(
        (m: any) => m.type === 'SIGNATURE_PUT' && m.key === 'guest_1' && m.signatureStore?.name === 'Arcade Ultra'
      )
    ).toBe(true);
  });
});
