import type {
  BankRewardDef,
  EventCardDef,
  MatchConfig,
  PencilFace,
  StoreTypeDef,
} from '../engine/types';

export const DEFAULT_MATCH_CONFIG: MatchConfig = {
  targetAssets: 10000,
  startingCash: 3000,
  bankruptLimit: 1,
  finishRoundOnWin: false,
};

export const PENCIL_FACES: readonly PencilFace[] = [1, 2, 3, 4, 5, 6, 7, 8, 'E'];

export const STORE_CAPACITY_BY_LEVEL: Record<1 | 2 | 3 | 4, number> = {
  1: 3,
  2: 4,
  3: 5,
  4: 6,
};

export const PAYDAY_CONFIG = {
  baseSalary: 250,
  assetRate: 0.04,
  stepBonus: 15,
  landMultiplier: 1.5,
} as const;

export const SHOP_RULES = {
  maxItemsPerVisit: 2,
  buyoutMultiplier: 1.25,
  sellLiquidationRate: 0.75,
  pointsPerPurchaseMin: 1,
  pointsPerPurchaseMax: 2,
} as const;

export const PLAYER_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22'];

export const STORE_TYPES: Record<string, StoreTypeDef> = {
  bakery: {
    id: 'bakery',
    name: 'Bakery',
    baseOpenCost: 300,
    segmentPool: 'food',
    items: [
      { id: 'roll', name: 'Dinner Roll', wholesaleCost: 25, retailPrice: 50, tier: 1, cashbackChance: 0.04 },
      { id: 'croissant', name: 'Croissant', wholesaleCost: 40, retailPrice: 80, tier: 1, cashbackChance: 0.06 },
      { id: 'baguette', name: 'Baguette', wholesaleCost: 55, retailPrice: 110, tier: 1, cashbackChance: 0.08 },
      { id: 'cake', name: 'Fruit Cake', wholesaleCost: 95, retailPrice: 185, tier: 2, cashbackChance: 0.1 },
      { id: 'truffle_tart', name: 'Truffle Tart', wholesaleCost: 160, retailPrice: 300, tier: 3, cashbackChance: 0.15 },
      { id: 'wedding_cake', name: 'Wedding Cake', wholesaleCost: 260, retailPrice: 480, tier: 4, cashbackChance: 0.2 },
    ],
  },
  candy_store: {
    id: 'candy_store',
    name: 'Candy Store',
    baseOpenCost: 260,
    segmentPool: 'food',
    items: [
      { id: 'gum', name: 'Bubble Gum', wholesaleCost: 20, retailPrice: 40, tier: 1, cashbackChance: 0.04 },
      { id: 'lollipop', name: 'Lollipop', wholesaleCost: 32, retailPrice: 65, tier: 1, cashbackChance: 0.06 },
      { id: 'caramel', name: 'Caramel Pack', wholesaleCost: 48, retailPrice: 95, tier: 1, cashbackChance: 0.08 },
      { id: 'fudge_box', name: 'Fudge Box', wholesaleCost: 80, retailPrice: 155, tier: 2, cashbackChance: 0.1 },
      { id: 'import_choco', name: 'Import Choco', wholesaleCost: 140, retailPrice: 265, tier: 3, cashbackChance: 0.15 },
      { id: 'golden_candy', name: 'Golden Candy', wholesaleCost: 220, retailPrice: 420, tier: 4, cashbackChance: 0.2 },
    ],
  },
  burger_shop: {
    id: 'burger_shop',
    name: 'Burger Shop',
    baseOpenCost: 360,
    segmentPool: 'food',
    items: [
      { id: 'fries', name: 'Fries', wholesaleCost: 30, retailPrice: 60, tier: 1, cashbackChance: 0.04 },
      { id: 'burger', name: 'Burger', wholesaleCost: 50, retailPrice: 100, tier: 1, cashbackChance: 0.06 },
      { id: 'shake', name: 'Milkshake', wholesaleCost: 65, retailPrice: 130, tier: 1, cashbackChance: 0.08 },
      { id: 'double_burger', name: 'Double Burger', wholesaleCost: 115, retailPrice: 220, tier: 2, cashbackChance: 0.12 },
      { id: 'wagyu_combo', name: 'Wagyu Combo', wholesaleCost: 190, retailPrice: 360, tier: 3, cashbackChance: 0.16 },
      { id: 'vip_feast', name: 'VIP Feast', wholesaleCost: 300, retailPrice: 550, tier: 4, cashbackChance: 0.22 },
    ],
  },
  comic_boy: {
    id: 'comic_boy',
    name: 'Comic Boy',
    baseOpenCost: 340,
    segmentPool: 'retail',
    items: [
      { id: 'sticker', name: 'Sticker Pack', wholesaleCost: 28, retailPrice: 55, tier: 1, cashbackChance: 0.04 },
      { id: 'manga_vol', name: 'Manga Vol', wholesaleCost: 48, retailPrice: 95, tier: 1, cashbackChance: 0.06 },
      { id: 'card_deck', name: 'Trading Cards', wholesaleCost: 62, retailPrice: 125, tier: 1, cashbackChance: 0.08 },
      { id: 'figure', name: 'Action Figure', wholesaleCost: 110, retailPrice: 210, tier: 2, cashbackChance: 0.12 },
      { id: 'signed_issue', name: 'Signed Issue', wholesaleCost: 185, retailPrice: 350, tier: 3, cashbackChance: 0.16 },
      { id: 'mint_collectible', name: 'Mint #1', wholesaleCost: 290, retailPrice: 540, tier: 4, cashbackChance: 0.22 },
    ],
  },
  gameland: {
    id: 'gameland',
    name: 'Gameland',
    baseOpenCost: 440,
    segmentPool: 'retail',
    items: [
      { id: 'battery', name: 'AA Batteries', wholesaleCost: 35, retailPrice: 70, tier: 1, cashbackChance: 0.05 },
      { id: 'memory_card', name: 'Memory Card', wholesaleCost: 60, retailPrice: 120, tier: 1, cashbackChance: 0.07 },
      { id: 'guidebook', name: 'Strategy Guide', wholesaleCost: 85, retailPrice: 165, tier: 1, cashbackChance: 0.09 },
      { id: 'controller', name: 'Controller', wholesaleCost: 135, retailPrice: 260, tier: 2, cashbackChance: 0.13 },
      { id: 'rpg_box', name: 'Collector RPG', wholesaleCost: 220, retailPrice: 420, tier: 3, cashbackChance: 0.18 },
      { id: 'console', name: 'Console Bundle', wholesaleCost: 340, retailPrice: 640, tier: 4, cashbackChance: 0.25 },
    ],
  },
  golden_jewelry: {
    id: 'golden_jewelry',
    name: 'Golden Jewelry',
    baseOpenCost: 520,
    segmentPool: 'retail',
    items: [
      { id: 'earrings', name: 'Stud Earrings', wholesaleCost: 45, retailPrice: 90, tier: 1, cashbackChance: 0.06 },
      { id: 'silver_pin', name: 'Silver Pin', wholesaleCost: 75, retailPrice: 150, tier: 1, cashbackChance: 0.08 },
      { id: 'charm', name: 'Gold Charm', wholesaleCost: 105, retailPrice: 205, tier: 1, cashbackChance: 0.1 },
      { id: 'pearl_ring', name: 'Pearl Ring', wholesaleCost: 165, retailPrice: 320, tier: 2, cashbackChance: 0.14 },
      { id: 'gold_watch', name: 'Gold Watch', wholesaleCost: 260, retailPrice: 500, tier: 3, cashbackChance: 0.2 },
      { id: 'diamond_crown', name: 'Diamond Crown', wholesaleCost: 400, retailPrice: 760, tier: 4, cashbackChance: 0.28 },
    ],
  },
};

export const EVENT_CARDS: readonly EventCardDef[] = [
  { id: 'cash_bonus', name: 'Mall Rebate', description: 'Receive $300 cash.', pointsAwarded: 1 },
  { id: 'tax_audit', name: 'Tax Audit', description: 'Pay $200 fee.', pointsAwarded: 2 },
  { id: 'free_direction', name: 'Mall Map', description: 'Unlock movement direction next turn.', pointsAwarded: 1 },
  { id: 'close_random', name: 'Health Inspection', description: 'Close a rival store for 2 turns.', pointsAwarded: 2 },
  { id: 'remote_stock', name: 'Express Courier', description: 'Restock one of your stores remotely.', pointsAwarded: 3 },
];

export const BANK_REWARDS: readonly BankRewardDef[] = [
  { id: 'earn_point', label: 'Claim 1 Bonus Point', pointCost: 0 },
  { id: 'cash_200', label: 'Receive $250', pointCost: 1 },
  { id: 'block_delivery', label: 'Block Rival Delivery (2 turns)', pointCost: 2 },
  { id: 'remote_deliver', label: 'Deliver to 1 Own Store', pointCost: 3 },
  { id: 'close_rival', label: 'Close 1 Rival Store (2 turns)', pointCost: 4 },
  { id: 'win_game', label: 'Buy Mall Monopoly (Win Game)', pointCost: 15 },
];