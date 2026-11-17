import type { EventCardDef } from '../engine/types';

// VERIFY: Point awards (0-3) and cash amounts marked below are defaults where
// Dreen's FAQ and the patch repo did not record exact numbers.
export const EVENT_CARDS: readonly EventCardDef[] = [
  // EVE_024 - EVE_029: Sell a store at multiplier
  { id: 'eve_024', name: 'Store Offer (1.5x)', description: 'You can sell a store for 1.5x its usual price.', pointsAwarded: 1, effect: { kind: 'sell_store_prompt', multiplier: 1.5, forced: false } },
  { id: 'eve_025', name: 'Store Offer (2x)', description: 'You can sell a store for twice its usual price.', pointsAwarded: 1, effect: { kind: 'sell_store_prompt', multiplier: 2, forced: false } },
  { id: 'eve_026', name: 'Store Offer (2.5x)', description: 'You can sell a store for 2.5x its usual price.', pointsAwarded: 2, effect: { kind: 'sell_store_prompt', multiplier: 2.5, forced: false } },
  { id: 'eve_027', name: 'Forced Sale (2x)', description: 'You must sell a store for twice its usual price.', pointsAwarded: 2, effect: { kind: 'sell_store_prompt', multiplier: 2, forced: true } },
  { id: 'eve_028', name: 'Forced Sale (2.5x)', description: 'You must sell a store for 2.5x its usual price.', pointsAwarded: 2, effect: { kind: 'sell_store_prompt', multiplier: 2.5, forced: true } },
  { id: 'eve_029', name: 'Forced Sale (3x)', description: 'You must sell a store for 3x its usual price.', pointsAwarded: 3, effect: { kind: 'sell_store_prompt', multiplier: 3, forced: true } },

  // EVE_030 - EVE_033: Store closures
  { id: 'eve_030', name: 'Store Inspection', description: 'Your stores are closed for 1 turn.', pointsAwarded: 2, effect: { kind: 'close_stores', scope: 'self', rounds: 1 } },
  { id: 'eve_031', name: 'Mall Holiday', description: 'All stores are closed for 1 turn.', pointsAwarded: 1, effect: { kind: 'close_stores', scope: 'all', rounds: 1 } },
  { id: 'eve_032', name: 'Exclusive Open', description: 'All stores except yours are closed for 1 turn.', pointsAwarded: 2, effect: { kind: 'close_stores', scope: 'others', rounds: 1 } },
  { id: 'eve_033', name: 'Mall Renovation', description: 'All stores are closed for 2 turns.', pointsAwarded: 2, effect: { kind: 'close_stores', scope: 'all', rounds: 2 } },

  // EVE_035 - EVE_042: Player-to-player & Santa cash
  { id: 'eve_035', name: 'Cash Handout', description: 'Each player takes $200 from you.', pointsAwarded: 2, effect: { kind: 'pay_each_rival', amount: 200 } }, // VERIFY amount
  { id: 'eve_036', name: 'Cash Collection', description: 'Receive $150 from everyone.', pointsAwarded: 1, effect: { kind: 'collect_each_rival', amount: 150 } }, // VERIFY amount
  { id: 'eve_037', name: 'Big Collection', description: 'Receive $300 from everyone.', pointsAwarded: 2, effect: { kind: 'collect_each_rival', amount: 300 } }, // VERIFY amount
  { id: 'eve_040', name: 'Santa Gift I', description: "Santa: Here's a present! (+$300)", pointsAwarded: 1, effect: { kind: 'cash_gift', amount: 300 } }, // VERIFY amount
  { id: 'eve_041', name: 'Santa Gift II', description: "Santa: Here's a present! (+$500)", pointsAwarded: 1, effect: { kind: 'cash_gift', amount: 500 } }, // VERIFY amount
  { id: 'eve_042', name: 'Santa Gift III', description: "Santa: Here's a present! (+$800)", pointsAwarded: 2, effect: { kind: 'cash_gift', amount: 800 } }, // VERIFY amount

  // EVE_043 - EVE_050: Movement & Stock manipulation
  { id: 'eve_043', name: 'Change Direction', description: 'You can turn around next turn.', pointsAwarded: 1, effect: { kind: 'unlock_dir_next' } },
  { id: 'eve_044', name: 'Forced U-Turn', description: 'You must turn around next turn.', pointsAwarded: 2, effect: { kind: 'reverse_dir_next' } },
  { id: 'eve_045', name: 'Spin Again', description: 'Spin the pencil one more time.', pointsAwarded: 1, effect: { kind: 'roll_again' } },
  { id: 'eve_046', name: 'Draw Again', description: 'Draw another event card.', pointsAwarded: 1, effect: { kind: 'draw_another' } },
  { id: 'eve_047', name: 'Owner Offer', description: 'Buy an empty store in a section where you own none.', pointsAwarded: 1, effect: { kind: 'buy_empty_store' } },
  { id: 'eve_048', name: 'Delivery Mix-Up (Cheap)', description: 'Each of your stores now has just 2 cheap items.', pointsAwarded: 2, effect: { kind: 'restock_grade', mode: 'second_cheapest_two' } },
  { id: 'eve_049', name: 'Stock Downgrade', description: 'Your stock is swapped for cheaper items.', pointsAwarded: 2, effect: { kind: 'downgrade_stock' } },
  { id: 'eve_050', name: 'Delivery Mix-Up (Costly)', description: 'Each of your stores is left with 1 costly item.', pointsAwarded: 2, effect: { kind: 'restock_grade', mode: 'dearest_one' } },

  // EVE_053 - EVE_060: Cash drops & Empty store liquidation
  { id: 'eve_053', name: 'Dropped Cash (1/3)', description: 'You dropped 1/3 of your money!', pointsAwarded: 2, effect: { kind: 'drop_cash_fraction', numerator: 1, denominator: 3 } },
  { id: 'eve_054', name: 'Dropped Cash (1/2)', description: 'You dropped 1/2 of your money!', pointsAwarded: 3, effect: { kind: 'drop_cash_fraction', numerator: 1, denominator: 2 } },
  { id: 'eve_058', name: 'Clear Empty (Self)', description: 'Your out-of-stock stores are sold for 1.5x usual price.', pointsAwarded: 2, effect: { kind: 'sell_empty_stores', scope: 'self', multiplier: 1.5 } },
  { id: 'eve_059', name: 'Clear Empty (All)', description: "Everyone's out-of-stock stores are sold for 1.5x usual price.", pointsAwarded: 1, effect: { kind: 'sell_empty_stores', scope: 'all', multiplier: 1.5 } },
  { id: 'eve_060', name: 'Clear Empty (Rivals)', description: 'Out-of-stock stores except yours are sold for 1.5x usual price.', pointsAwarded: 1, effect: { kind: 'sell_empty_stores', scope: 'others', multiplier: 1.5 } },

  // EVE_070 - EVE_076: Elevator & Misc
  { id: 'eve_070', name: 'Elevator Outage', description: 'No one can use the elevator for 1 turn.', pointsAwarded: 1, effect: { kind: 'elevator_lock', mode: 'none', rounds: 1 } },
  { id: 'eve_071', name: 'VIP Elevator', description: 'Only you can use the elevator for 1 turn.', pointsAwarded: 1, effect: { kind: 'elevator_lock', mode: 'only_self', rounds: 1 } },
  { id: 'eve_075', name: 'Chirp-Chirp Sandals', description: 'You are now wearing "Chirp-Chirp" sandals.', pointsAwarded: 1, effect: { kind: 'chirp_sandals' } },
  { id: 'eve_076', name: 'Miss', description: 'Nothing happens.', pointsAwarded: 0, effect: { kind: 'nothing' } },

  // EVE_080 - EVE_088: Seasonal / Sale events
  { id: 'eve_080', name: 'Snowstorm Sale', description: 'A snowstorm has hit! All items are 50% off for 1 turn.', pointsAwarded: 1, effect: { kind: 'global_sale', priceMultiplier: 0.5, rounds: 1 } },
  { id: 'eve_081', name: 'Hurricane Sale', description: 'A hurricane has hit! All items are 50% off for 1 turn.', pointsAwarded: 1, effect: { kind: 'global_sale', priceMultiplier: 0.5, rounds: 1 } },
  { id: 'eve_082', name: 'Halloween Sale', description: 'Halloween Sale! All items are 30% off for 1 turn.', pointsAwarded: 1, effect: { kind: 'global_sale', priceMultiplier: 0.7, rounds: 1 } },
  { id: 'eve_083', name: 'Winter Sale', description: 'All items are 30% off for 1 turn.', pointsAwarded: 1, effect: { kind: 'global_sale', priceMultiplier: 0.7, rounds: 1 } }, // VERIFY name & %
  { id: 'eve_084', name: 'Final Sale', description: 'Final Sale! All items are 70% off for 1 turn.', pointsAwarded: 1, effect: { kind: 'global_sale', priceMultiplier: 0.3, rounds: 1 } }, // Patch: Clearance Sale
  { id: 'eve_085', name: 'Spring Sale', description: 'All items are 30% off for 1 turn.', pointsAwarded: 1, effect: { kind: 'global_sale', priceMultiplier: 0.7, rounds: 1 } }, // VERIFY name & %
  { id: 'eve_086', name: 'Summer Sale', description: 'All items are 50% off for 1 turn.', pointsAwarded: 1, effect: { kind: 'global_sale', priceMultiplier: 0.5, rounds: 1 } }, // VERIFY name & %
  { id: 'eve_087', name: 'Fall Sale', description: 'Fall Sale! All items are 30% off for 1 turn.', pointsAwarded: 1, effect: { kind: 'global_sale', priceMultiplier: 0.7, rounds: 1 } }, // VERIFY %
  { id: 'eve_088', name: 'Seasonal Sale', description: 'All items are 50% off for 1 turn.', pointsAwarded: 1, effect: { kind: 'global_sale', priceMultiplier: 0.5, rounds: 1 } }, // VERIFY name & %

  // Reachable cards from Dreen's FAQ (IDs in 34, 51-52, 61-69 — VERIFY exact IDs)
  { id: 'dreen_miss_turn', name: 'Miss a Turn', description: 'Miss your next turn.', pointsAwarded: 0, effect: { kind: 'miss_turn' } },
  { id: 'dreen_go_move', name: 'Go!', description: 'Move 1-7 squares and receive free points.', pointsAwarded: 2, effect: { kind: 'go_steps_1_7' } },
  { id: 'dreen_lose_store', name: 'Lose a Store', description: 'You lose one of your stores.', pointsAwarded: 3, effect: { kind: 'lose_store' } },
  { id: 'dreen_lose_stock', name: 'Shoplifting', description: 'You lose some of the stock in your stores.', pointsAwarded: 2, effect: { kind: 'lose_some_stock' } },
  { id: 'dreen_equalize_cash', name: 'Cash Match', description: 'All players now have the same cash as you.', pointsAwarded: 1, effect: { kind: 'equalize_cash' } },
  { id: 'dreen_close_empty', name: 'Shutdown', description: 'All currently out-of-stock stores are closed down.', pointsAwarded: 1, effect: { kind: 'close_empty_stores', rounds: 2 } },
  { id: 'dreen_elev_self_ban', name: 'Elevator Ban', description: 'You cannot use the elevator for 2 turns.', pointsAwarded: 2, effect: { kind: 'elevator_lock', mode: 'ban_self', rounds: 2 } },
  { id: 'dreen_elev_all_ban_2', name: 'Elevator Outage (2)', description: 'No one can use the elevator for 2 turns.', pointsAwarded: 1, effect: { kind: 'elevator_lock', mode: 'none', rounds: 2 } },
  { id: 'dreen_elev_only_me_2', name: 'VIP Elevator (2)', description: 'Only you can use the elevator for 2 turns.', pointsAwarded: 1, effect: { kind: 'elevator_lock', mode: 'only_self', rounds: 2 } },
];