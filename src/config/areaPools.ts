/**
 * Official PS1 Top Shop 4-store Area Pools (Areas 0-10, 44 unique store types).
 * Verified from SLUS_013.33 (0x800acef4, 0x8005ae98): storeId = areaId * 4 + 0..3.
 */
export type AreaId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export const AREA_POOLS: Record<AreaId, readonly string[]> = {
  0: ['pharmacy', 'candy_store', 'bakery', 'kiss'],
  1: ['burger_shop', 'johnson_books', 'cookin_fun', 'flower_heart'],
  2: ['comic_boy', 'meat_land', 'corner_deli_cafe', 'bobsons'],
  3: ['pancake_house', 'camera_shop', 'gameland', 'office_needs'],
  4: ['george_video', 'tokyo_restaurant', 'curry_india', 'fruits_market'],
  5: ['mens_clothes', 'noodle_house', 'fish_market', 'star_coffee'],
  6: ['sports_shop', 'saving_groceries', 'juice_pub', 'italian'],
  7: ['aesthetics_julia', 'arcade_games', 'fun_toys', 'home_needs'],
  8: ['fishing_gear', 'electrical_goods', 'bbq_house', 'fancy_dress'],
  9: ['auto_parts', 'kid', 'animal_world', 'yamato_music'],
  10: ['tour_tours', 'movie_theater', 'golden_jewelry', 'fresh_estate'],
};
