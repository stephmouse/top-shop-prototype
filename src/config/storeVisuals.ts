export type StoreVisualCategory = 'food' | 'fashion' | 'tech' | 'hobby' | 'market' | 'luxury';

export type StoreIconId =
  | 'sparkles' | 'paw' | 'gamepad' | 'wheel' | 'bread' | 'grill' | 'shirt'
  | 'burger' | 'camera' | 'candy' | 'book' | 'coffee' | 'bowl' | 'bolt'
  | 'fish' | 'flower' | 'house' | 'fruit' | 'gift' | 'gem' | 'film'
  | 'meat' | 'briefcase' | 'cross' | 'ball' | 'plane' | 'music'
  | 'vacant' | 'bank' | 'elevator' | 'escalator';

export interface StoreVisualMeta {
  category: StoreVisualCategory;
  iconId: StoreIconId;
  accent: string;
}

const C = 'M 12 12 m -4 0 a 4 4 0 1 0 8 0 a 4 4 0 1 0 -8 0';

export const STORE_ICON_PATHS: Record<StoreIconId, readonly string[]> = {
  sparkles: ['M 12 3 L 14 9 L 20 11 L 14 13 L 12 19 L 10 13 L 4 11 L 10 9 Z', 'M 19 4 L 19 7 M 17.5 5.5 L 20.5 5.5'],
  paw: ['M 8 16 C 8 13 16 13 16 16 C 16 19 8 19 8 16 Z', 'M 6 10 a 1.5 2 0 1 0 3 0 a 1.5 2 0 1 0 -3 0', 'M 10.5 7.5 a 1.5 2 0 1 0 3 0 a 1.5 2 0 1 0 -3 0', 'M 15 10 a 1.5 2 0 1 0 3 0 a 1.5 2 0 1 0 -3 0'],
  gamepad: ['M 6 9 H 18 A 4 4 0 0 1 21 15 L 20 18 A 2 2 0 0 1 17 18 L 15 15 H 9 L 7 18 A 2 2 0 0 1 4 18 L 3 15 A 4 4 0 0 1 6 9 Z', 'M 8 12 H 11 M 9.5 10.5 V 13.5 M 15.5 11.5 H 16 M 17 13 H 17.5'],
  wheel: ['M 12 12 m -8 0 a 8 8 0 1 0 16 0 a 8 8 0 1 0 -16 0', 'M 12 12 m -2.5 0 a 2.5 2.5 0 1 0 5 0 a 2.5 2.5 0 1 0 -5 0', 'M 12 4 V 9.5 M 5 15 L 9.8 13 M 19 15 L 14.2 13'],
  bread: ['M 4 14 C 4 8 20 8 20 14 V 18 H 4 Z', 'M 9 11 L 10.5 13 M 13.5 11 L 15 13'],
  grill: ['M 5 12 H 19 V 16 A 5 5 0 0 1 5 16 Z', 'M 9 7 C 9 5 11 5 11 7 M 14 7 C 14 5 16 5 16 7 M 19 13 H 22'],
  shirt: ['M 8 5 L 4 8 L 6 11 L 8 10 V 19 H 16 V 10 L 18 11 L 20 8 L 16 5 C 14.5 7 9.5 7 8 5 Z'],
  burger: ['M 5 11 C 5 6.5 19 6.5 19 11 Z', 'M 4 14 H 20', 'M 5 17 H 19 V 19 H 5 Z'],
  camera: ['M 4 8 H 8 L 10 5 H 14 L 16 8 H 20 V 19 H 4 Z', C],
  candy: ['M 7 12 C 7 8 17 8 17 12 C 17 16 7 16 7 12 Z', 'M 7 10 L 3 7 V 17 L 7 14', 'M 17 10 L 21 7 V 17 L 17 14'],
  book: ['M 3 6 C 7 5 10 6 12 8 C 14 6 17 5 21 6 V 18 C 17 17 14 18 12 19 C 10 18 7 17 3 18 Z', 'M 12 8 V 19'],
  coffee: ['M 5 10 H 16 V 16 A 4 4 0 0 1 5 16 Z', 'M 16 11 H 18 A 2 2 0 0 1 18 15 H 16', 'M 9 5 V 7 M 12 5 V 7'],
  bowl: ['M 4 12 H 20 A 8 7 0 0 1 4 12 Z', 'M 9 19 H 15', 'M 8 6 L 13 9 M 14 5 L 18 8'],
  bolt: ['M 13 3 L 6 13 H 12 L 11 21 L 18 11 H 12 Z'],
  fish: ['M 4 12 C 8 6 15 6 18 12 C 15 18 8 18 4 12 Z', 'M 18 12 L 21 8 V 16 Z', 'M 8 11 H 8.5'],
  flower: ['M 12 18 V 11', 'M 12 7 a 2.2 2.2 0 1 0 0.1 0', 'M 8.5 10 a 2.2 2.2 0 1 0 0.1 0', 'M 15.5 10 a 2.2 2.2 0 1 0 0.1 0', 'M 12 15 L 16 13'],
  house: ['M 3 11 L 12 4 L 21 11', 'M 5 10 V 19 H 19 V 10', 'M 10 19 V 14 H 14 V 19'],
  fruit: ['M 12 8 C 8 7 5 10 6 15 C 7 19 10 20 12 19 C 14 20 17 19 18 15 C 19 10 16 7 12 8 Z', 'M 12 8 C 12 5 14 4 16 4'],
  gift: ['M 4 10 H 20 V 19 H 4 Z', 'M 3 7 H 21 V 10 H 3 Z', 'M 12 7 V 19', 'M 12 7 C 10 4 7 4 8 7 M 12 7 C 14 4 17 4 16 7'],
  gem: ['M 6 5 H 18 L 21 10 L 12 20 L 3 10 Z', 'M 3 10 H 21', 'M 9 5 L 12 20 L 15 5'],
  film: ['M 4 6 H 20 V 18 H 4 Z', 'M 8 6 V 18 M 16 6 V 18 M 4 10 H 8 M 4 14 H 8 M 16 10 H 20 M 16 14 H 20'],
  meat: ['M 7 14 C 5 10 9 5 15 6 C 19 7 20 12 17 16 C 14 19 9 18 7 14 Z', 'M 11 11 a 1.5 1.5 0 1 0 3 0 a 1.5 1.5 0 1 0 -3 0'],
  briefcase: ['M 4 8 H 20 V 19 H 4 Z', 'M 9 8 V 5 H 15 V 8', 'M 4 12 H 20'],
  cross: ['M 9 4 H 15 V 9 H 20 V 15 H 15 V 20 H 9 V 15 H 4 V 9 H 9 Z'],
  ball: ['M 12 12 m -8 0 a 8 8 0 1 0 16 0 a 8 8 0 1 0 -16 0', 'M 6 7 C 10 11 10 13 6 17', 'M 18 7 C 14 11 14 13 18 17'],
  plane: ['M 3 13 L 21 6 L 15 19 L 11 14 Z', 'M 11 14 L 21 6'],
  music: ['M 9 17 V 6 L 19 4 V 15', 'M 6 17 a 2.5 2 0 1 0 3 0 a 2.5 2 0 1 0 -3 0', 'M 16 15 a 2.5 2 0 1 0 3 0 a 2.5 2 0 1 0 -3 0'],
  vacant: ['M 4 11 H 20 V 19 H 4 Z', 'M 8 11 L 12 6 L 16 11'],
  bank: ['M 3 9 L 12 4 L 21 9 Z', 'M 6 9 V 17 M 10 9 V 17 M 14 9 V 17 M 18 9 V 17', 'M 4 19 H 20'],
  elevator: ['M 5 5 H 19 V 19 H 5 Z', 'M 9 10 L 12 7 L 15 10 M 9 14 L 12 17 L 15 14'],
  escalator: ['M 4 17 H 9 L 15 9 H 20', 'M 8 12 L 13 7 H 9 M 13 7 V 11'],
};

const M = (category: StoreVisualCategory, iconId: StoreIconId, accent: string): StoreVisualMeta => ({ category, iconId, accent });

export const STORE_VISUALS: Record<string, StoreVisualMeta> = {
  aesthetics_julia: M('fashion', 'sparkles', '#e879b9'),
  animal_world: M('hobby', 'paw', '#f59e0b'),
  arcade_games: M('hobby', 'gamepad', '#a855f7'),
  auto_parts: M('tech', 'wheel', '#94a3b8'),
  bakery: M('food', 'bread', '#f59e0b'),
  bbq_house: M('food', 'grill', '#ef4444'),
  bobsons: M('fashion', 'shirt', '#ec4899'),
  burger_shop: M('food', 'burger', '#f97316'),
  camera_shop: M('tech', 'camera', '#38bdf8'),
  candy_store: M('food', 'candy', '#f472b6'),
  comic_boy: M('hobby', 'book', '#3b82f6'),
  cookin_fun: M('market', 'grill', '#fb923c'),
  corner_deli_cafe: M('food', 'coffee', '#d97706'),
  curry_india: M('food', 'bowl', '#eab308'),
  electrical_goods: M('tech', 'bolt', '#60a5fa'),
  fancy_dress: M('luxury', 'shirt', '#c084fc'),
  fish_market: M('market', 'fish', '#38bdf8'),
  fishing_gear: M('hobby', 'fish', '#2dd4bf'),
  flower_heart: M('luxury', 'flower', '#fb7185'),
  fresh_estate: M('luxury', 'house', '#34d399'),
  fruits_market: M('market', 'fruit', '#4ade80'),
  fun_toys: M('hobby', 'gift', '#fbbf24'),
  golden_jewelry: M('luxury', 'gem', '#facc15'),
  gameland: M('hobby', 'gamepad', '#818cf8'),
  george_video: M('tech', 'film', '#6366f1'),
  home_needs: M('market', 'house', '#34d399'),
  italian: M('food', 'bowl', '#22c55e'),
  johnson_books: M('hobby', 'book', '#60a5fa'),
  juice_pub: M('food', 'coffee', '#fb7185'),
  kid: M('fashion', 'gift', '#38bdf8'),
  kiss: M('luxury', 'sparkles', '#f43f5e'),
  meat_land: M('market', 'meat', '#f87171'),
  mens_clothes: M('fashion', 'shirt', '#60a5fa'),
  movie_theater: M('hobby', 'film', '#f43f5e'),
  noodle_house: M('food', 'bowl', '#facc15'),
  office_needs: M('tech', 'briefcase', '#94a3b8'),
  pancake_house: M('food', 'bread', '#fbbf24'),
  pharmacy: M('market', 'cross', '#2dd4bf'),
  saving_groceries: M('market', 'fruit', '#22c55e'),
  sports_shop: M('hobby', 'ball', '#fb923c'),
  star_coffee: M('food', 'coffee', '#a16207'),
  tokyo_restaurant: M('food', 'bowl', '#fb7185'),
  tour_tours: M('luxury', 'plane', '#38bdf8'),
  yamato_music: M('hobby', 'music', '#c084fc'),
};

const FALLBACK_VISUAL: StoreVisualMeta = { category: 'market', iconId: 'vacant', accent: '#64748b' };

export function getStoreVisual(storeTypeId: string | null | undefined): StoreVisualMeta {
  return (storeTypeId && STORE_VISUALS[storeTypeId]) || FALLBACK_VISUAL;
}
