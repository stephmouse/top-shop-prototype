import { STORE_TYPES } from './balance';
import { getStoreVisual, STORE_ICON_PATHS } from './storeVisuals';
import type { StoreIconId, StoreVisualCategory } from './storeVisuals';
import type { ItemDef, Player, Shop } from '../engine/types';

export interface SignatureStoreSpec {
  name: string;
  iconId: StoreIconId;
  accent: string;
  itemNames: [string, string, string, string, string, string];
}

const EXCLUDED_ICONS = new Set<StoreIconId>(['vacant', 'bank', 'elevator', 'escalator']);

export const SIGNATURE_ICON_IDS: readonly StoreIconId[] = (
  Object.keys(STORE_ICON_PATHS) as StoreIconId[]
).filter((id) => !EXCLUDED_ICONS.has(id));

export const DEFAULT_SIGNATURE_ACCENT = '#facc15';
export const SIGNATURE_NAME_MAX_LEN = 24;
export const SIGNATURE_ITEM_MAX_LEN = 22;

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export const SIGNATURE_PRESET_IDEAS: ReadonlyArray<SignatureStoreSpec> = [
  {
    name: 'Starlight Emporium',
    iconId: 'sparkles',
    accent: '#facc15',
    itemNames: ['Glow Keychain', 'Nebula Soda', 'Comet Poster', 'Prism Lamp', 'Astro Jacket', 'Crown Jewel Box'],
  },
  {
    name: 'Pixel Palace',
    iconId: 'gamepad',
    accent: '#38bdf8',
    itemNames: ['Coin Token', 'Chiptune Tape', 'Memory Card', 'Fight Stick', 'CRT Monitor', 'Gold Console'],
  },
  {
    name: 'Velvet Café',
    iconId: 'coffee',
    accent: '#f472b6',
    itemNames: ['Sugar Wafer', 'Iced Latte', 'Berry Tart', 'Matcha Set', 'Roaster Box', 'Reserve Truffles'],
  },
  {
    name: 'Midnight Vinyl',
    iconId: 'music',
    accent: '#c084fc',
    itemNames: ['Guitar Pick', 'Cassette Single', 'Band Tee', 'Synth Pedal', 'Tube Amp', 'Signed Master LP'],
  },
  {
    name: 'Catnip Corner',
    iconId: 'paw',
    accent: '#fb923c',
    itemNames: ['Bell Collar', 'Feather Wand', 'Catnip Plush', 'Cozy Tunnel', 'Window Hammock', 'Deluxe Cat Tower'],
  },
  {
    name: 'Diamond Vault',
    iconId: 'gem',
    accent: '#4ade80',
    itemNames: ['Polishing Cloth', 'Silver Pin', 'Topaz Ring', 'Pearl Studs', 'Emerald Watch', 'Royal Tiara'],
  },
];

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Sanitizes user-edited Signature Store data; returns `undefined` if name is empty. */
export function sanitizeSignatureStore(raw: unknown): SignatureStoreSpec | undefined {
  if (!isPlainRecord(raw)) return undefined;
  const rawName = typeof raw.name === 'string' ? raw.name.trim().slice(0, SIGNATURE_NAME_MAX_LEN) : '';
  if (!rawName) return undefined;

  const iconId: StoreIconId =
    typeof raw.iconId === 'string' && SIGNATURE_ICON_IDS.includes(raw.iconId as StoreIconId)
      ? (raw.iconId as StoreIconId)
      : 'sparkles';
  const accent =
    typeof raw.accent === 'string' && HEX_RE.test(raw.accent.trim())
      ? raw.accent.trim().toLowerCase()
      : DEFAULT_SIGNATURE_ACCENT;

  const rawItems = Array.isArray(raw.itemNames) ? raw.itemNames : [];
  const itemNames: [string, string, string, string, string, string] = [
    typeof rawItems[0] === 'string' ? rawItems[0].trim().slice(0, SIGNATURE_ITEM_MAX_LEN) : '',
    typeof rawItems[1] === 'string' ? rawItems[1].trim().slice(0, SIGNATURE_ITEM_MAX_LEN) : '',
    typeof rawItems[2] === 'string' ? rawItems[2].trim().slice(0, SIGNATURE_ITEM_MAX_LEN) : '',
    typeof rawItems[3] === 'string' ? rawItems[3].trim().slice(0, SIGNATURE_ITEM_MAX_LEN) : '',
    typeof rawItems[4] === 'string' ? rawItems[4].trim().slice(0, SIGNATURE_ITEM_MAX_LEN) : '',
    typeof rawItems[5] === 'string' ? rawItems[5].trim().slice(0, SIGNATURE_ITEM_MAX_LEN) : '',
  ];

  return { name: rawName, iconId, accent, itemNames };
}

/** Strict validator for wire transport and persistence boundaries. */
export function isValidSignatureStore(raw: unknown): raw is SignatureStoreSpec {
  if (!isPlainRecord(raw)) return false;
  if (typeof raw.name !== 'string') return false;
  const trimmed = raw.name.trim();
  if (trimmed.length === 0 || trimmed.length > SIGNATURE_NAME_MAX_LEN) return false;
  if (typeof raw.iconId !== 'string' || !SIGNATURE_ICON_IDS.includes(raw.iconId as StoreIconId)) return false;
  if (typeof raw.accent !== 'string' || !HEX_RE.test(raw.accent)) return false;
  if (!Array.isArray(raw.itemNames) || raw.itemNames.length !== 6) return false;
  return raw.itemNames.every((item) => typeof item === 'string' && item.length <= SIGNATURE_ITEM_MAX_LEN);
}

/** Resolves a player's active Signature Store spec from synced network map or local player state. */
export function getPlayerSignatureSpec(
  playerId: string | null | undefined,
  players: readonly Player[] = [],
  syncedSignatures?: Readonly<Record<string, SignatureStoreSpec>>
): SignatureStoreSpec | undefined {
  if (!playerId) return undefined;
  const fromSync = syncedSignatures?.[playerId];
  if (fromSync?.name) return fromSync;
  const player = players.find((p) => p.id === playerId);
  return player?.signatureStore?.name ? player.signatureStore : undefined;
}

/** Resolves display name for a shop, applying the owner's custom Signature Store name when active. */
export function getShopDisplayName(
  shop: Shop,
  players: readonly Player[] = [],
  syncedSignatures?: Readonly<Record<string, SignatureStoreSpec>>
): string {
  const def = shop.storeTypeId ? STORE_TYPES[shop.storeTypeId] : undefined;
  const fallback = def?.name ?? shop.id;
  if (!shop.signatureOwnerId || shop.ownerId !== shop.signatureOwnerId) return fallback;
  const spec = getPlayerSignatureSpec(shop.signatureOwnerId, players, syncedSignatures);
  return spec?.name || fallback;
}

/** Resolves icon and accent metadata for a shop, overriding with Signature Store visuals when active. */
export function getShopDisplayVisual(
  shop: Shop,
  players: readonly Player[] = [],
  syncedSignatures?: Readonly<Record<string, SignatureStoreSpec>>
): { iconId: StoreIconId; accent: string; category?: StoreVisualCategory; isSignature: boolean } {
  const vis = getStoreVisual(shop.storeTypeId);
  const isSig = Boolean(shop.signatureOwnerId && shop.ownerId === shop.signatureOwnerId);
  if (!isSig) return { ...vis, isSignature: false };
  const spec = getPlayerSignatureSpec(shop.signatureOwnerId, players, syncedSignatures);
  if (!spec) return { ...vis, isSignature: true };
  return {
    iconId: spec.iconId,
    accent: spec.accent || vis.accent,
    category: vis.category,
    isSignature: true,
  };
}

/** Resolves custom item name for a Signature Store slot (sorted cheapest-to-most-expensive, indices 0..5). */
export function getShopItemDisplayName(
  shop: Shop,
  item: ItemDef,
  players: readonly Player[] = [],
  syncedSignatures?: Readonly<Record<string, SignatureStoreSpec>>
): string {
  if (!shop.signatureOwnerId || shop.ownerId !== shop.signatureOwnerId || !shop.storeTypeId) {
    return item.name;
  }
  const spec = getPlayerSignatureSpec(shop.signatureOwnerId, players, syncedSignatures);
  if (!spec) return item.name;
  const def = STORE_TYPES[shop.storeTypeId];
  if (!def) return item.name;
  const sorted = [...def.items].sort((a, b) => a.retailPrice - b.retailPrice);
  const idx = sorted.findIndex((i) => i.id === item.id);
  const custom = idx >= 0 ? spec.itemNames[idx]?.trim() : '';
  return custom || item.name;
}
