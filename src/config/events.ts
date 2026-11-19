import type { EventCardDef } from '../engine/types';

// Full 55 reachable US Event cards verified against SLUS_013.33 & EVE_000..099.J.
// Cash events scale with computeEventBaseCash(totalMonths) = (floor(totalMonths / 24) + 1) * 100.
export const EVENT_CARDS: readonly EventCardDef[] = [
  // EVE_024 - EVE_029: Sell a store at multiplier
  { id: 'eve_024', name: 'Store Offer (1.5x)', description: 'Your store can be sold for 1.5 times the price.', awardsPoints: true, effect: { kind: 'sell_store_prompt', multiplier: 1.5, forced: false } },
  { id: 'eve_025', name: 'Store Offer (2x)', description: 'Your store can be sold for twice the price.', awardsPoints: true, effect: { kind: 'sell_store_prompt', multiplier: 2, forced: false } },
  { id: 'eve_026', name: 'Store Offer (2.5x)', description: 'Your store can be sold for 2.5 times the price.', awardsPoints: true, effect: { kind: 'sell_store_prompt', multiplier: 2.5, forced: false } },
  { id: 'eve_027', name: 'Forced Sale (2x)', description: 'Please sell your store for twice the price.', awardsPoints: true, effect: { kind: 'sell_store_prompt', multiplier: 2, forced: true } },
  { id: 'eve_028', name: 'Forced Sale (2.5x)', description: 'Please sell your store for 2.5 times price.', awardsPoints: true, effect: { kind: 'sell_store_prompt', multiplier: 2.5, forced: true } },
  { id: 'eve_029', name: 'Forced Sale (3x)', description: 'Please sell your store for 3 times price.', awardsPoints: true, effect: { kind: 'sell_store_prompt', multiplier: 3, forced: true } },

  // EVE_030 - EVE_033: Store closures
  { id: 'eve_030', name: 'Store Inspection', description: 'Your store is closed one turn.', awardsPoints: true, effect: { kind: 'close_stores', scope: 'self', rounds: 1 } },
  { id: 'eve_031', name: 'Mall Holiday', description: 'All stores are closed one turn.', awardsPoints: true, effect: { kind: 'close_stores', scope: 'all', rounds: 1 } },
  { id: 'eve_032', name: 'Exclusive Open', description: 'All stores except yours are closed.', awardsPoints: true, effect: { kind: 'close_stores', scope: 'others', rounds: 1 } },
  { id: 'eve_033', name: 'Mall Renovation', description: 'All stores are closed two turns.', awardsPoints: true, effect: { kind: 'close_stores', scope: 'all', rounds: 2 } },

  // EVE_034 - EVE_037, EVE_040 - EVE_042: Scaling player-to-player & Santa cash
  { id: 'eve_034', name: 'Cash Handout I', description: 'Each player took 0.5x base cash from you.', awardsPoints: true, effect: { kind: 'pay_each_rival_scaled', baseMultiplier: 0.5 } },
  { id: 'eve_035', name: 'Cash Handout II', description: 'Each player took away 1x base cash from you.', awardsPoints: true, effect: { kind: 'pay_each_rival_scaled', baseMultiplier: 1 } },
  { id: 'eve_036', name: 'Cash Collection I', description: 'You are given 1x base cash by everybody.', awardsPoints: true, effect: { kind: 'collect_each_rival_scaled', baseMultiplier: 1 } },
  { id: 'eve_037', name: 'Cash Collection II', description: 'Received 1.5x base cash from everybody.', awardsPoints: true, effect: { kind: 'collect_each_rival_scaled', baseMultiplier: 1.5 } },
  { id: 'eve_040', name: 'Santa Gift I', description: "Santa: Here's a present! (3x base cash)", awardsPoints: true, effect: { kind: 'cash_gift_scaled', baseMultiplier: 3 } },
  { id: 'eve_041', name: 'Santa Gift II', description: "Santa: Here's a present! (5x base cash)", awardsPoints: true, effect: { kind: 'cash_gift_scaled', baseMultiplier: 5 } },
  { id: 'eve_042', name: 'Santa Gift III', description: "Santa: Here's a present! (7x base cash)", awardsPoints: true, effect: { kind: 'cash_gift_scaled', baseMultiplier: 7 } },

  // EVE_043 - EVE_050: Movement & Stock manipulation
  { id: 'eve_043', name: 'Change Direction', description: 'You can change directions next turn.', awardsPoints: true, effect: { kind: 'unlock_dir_next' } },
  { id: 'eve_044', name: 'Forced U-Turn', description: 'You will change directions next turn.', awardsPoints: true, effect: { kind: 'reverse_dir_next' } },
  { id: 'eve_045', name: 'Spin Again', description: 'Roll the pencil one more time.', awardsPoints: true, effect: { kind: 'roll_again' } },
  { id: 'eve_046', name: 'Draw Again', description: 'Flip a card one more time.', awardsPoints: true, effect: { kind: 'draw_another' } },
  { id: 'eve_047', name: 'Owner Offer', description: 'You can purchase an empty store in a section where you own none.', awardsPoints: true, effect: { kind: 'buy_empty_store' } },
  { id: 'eve_048', name: 'Delivery Mix-Up (Cheap)', description: 'All items have been changed to 2 cheap items!', awardsPoints: true, effect: { kind: 'restock_grade', mode: 'second_cheapest_two' } },
  { id: 'eve_049', name: 'Stock Downgrade', description: 'Due to an error in ordering, all items changed to cheaper items.', awardsPoints: true, effect: { kind: 'downgrade_stock' } },
  { id: 'eve_050', name: 'Delivery Mix-Up (Costly)', description: 'Due to an error in ordering, all items changed to 1 expensive item.', awardsPoints: true, effect: { kind: 'restock_grade', mode: 'dearest_one' } },

  // EVE_051 - EVE_054: Cash drops
  { id: 'eve_051', name: 'Dropped Cash I', description: 'You dropped 3x base cash somewhere.', awardsPoints: true, effect: { kind: 'drop_cash_scaled', baseMultiplier: 3 } },
  { id: 'eve_052', name: 'Dropped Cash II', description: 'You dropped 6x base cash somewhere.', awardsPoints: true, effect: { kind: 'drop_cash_scaled', baseMultiplier: 6 } },
  { id: 'eve_053', name: 'Dropped Cash (1/3)', description: 'You dropped 1/3 of the total sum of money.', awardsPoints: true, effect: { kind: 'drop_cash_fraction', numerator: 1, denominator: 3 } },
  { id: 'eve_054', name: 'Dropped Cash (1/2)', description: 'You dropped 1/2 of the total sum of money.', awardsPoints: true, effect: { kind: 'drop_cash_fraction', numerator: 1, denominator: 2 } },

  // EVE_058 - EVE_060: Empty store liquidation
  { id: 'eve_058', name: 'Clear Empty (Self)', description: 'Sells stores in shortage owned by you (1.5x).', awardsPoints: true, effect: { kind: 'sell_empty_stores', scope: 'self', multiplier: 1.5 } },
  { id: 'eve_059', name: 'Clear Empty (All)', description: 'Sells stores in shortage owned by everyone (1.5x).', awardsPoints: true, effect: { kind: 'sell_empty_stores', scope: 'all', multiplier: 1.5 } },
  { id: 'eve_060', name: 'Clear Empty (Rivals)', description: 'Sells stores in shortage except yours (1.5x).', awardsPoints: true, effect: { kind: 'sell_empty_stores', scope: 'others', multiplier: 1.5 } },

  // EVE_061 - EVE_068: Go forward 1..8 steps
  { id: 'eve_061', name: 'Go Forward 1', description: 'Go forward 1 step.', awardsPoints: true, effect: { kind: 'go_steps', steps: 1 } },
  { id: 'eve_062', name: 'Go Forward 2', description: 'Go forward 2 steps.', awardsPoints: true, effect: { kind: 'go_steps', steps: 2 } },
  { id: 'eve_063', name: 'Go Forward 3', description: 'Go forward 3 steps.', awardsPoints: true, effect: { kind: 'go_steps', steps: 3 } },
  { id: 'eve_064', name: 'Go Forward 4', description: 'Go forward 4 steps.', awardsPoints: true, effect: { kind: 'go_steps', steps: 4 } },
  { id: 'eve_065', name: 'Go Forward 5', description: 'Go forward 5 steps.', awardsPoints: true, effect: { kind: 'go_steps', steps: 5 } },
  { id: 'eve_066', name: 'Go Forward 6', description: 'Go forward 6 steps.', awardsPoints: true, effect: { kind: 'go_steps', steps: 6 } },
  { id: 'eve_067', name: 'Go Forward 7', description: 'Go forward 7 steps.', awardsPoints: true, effect: { kind: 'go_steps', steps: 7 } },
  { id: 'eve_068', name: 'Go Forward 8', description: 'Go forward 8 steps.', awardsPoints: true, effect: { kind: 'go_steps', steps: 8 } },

  // EVE_069 - EVE_072, EVE_075 - EVE_076: Elevator, Cash Match, Misc
  { id: 'eve_069', name: 'Elevator Ban', description: "You can't use the elevator for one turn.", awardsPoints: true, effect: { kind: 'elevator_lock', mode: 'ban_self', rounds: 1 } },
  { id: 'eve_070', name: 'Elevator Outage', description: 'No one can use the elevator one turn.', awardsPoints: true, effect: { kind: 'elevator_lock', mode: 'none', rounds: 1 } },
  { id: 'eve_071', name: 'VIP Elevator', description: 'No one except you can use the elevator one turn.', awardsPoints: true, effect: { kind: 'elevator_lock', mode: 'only_self', rounds: 1 } },
  { id: 'eve_072', name: 'Cash Match', description: 'Everyone now has the same amount of money as you.', awardsPoints: true, effect: { kind: 'equalize_cash' } },
  { id: 'eve_075', name: 'Chirp-Chirp Sandals', description: 'You have worn the "Chirp-Chirp" Sandals.', awardsPoints: true, effect: { kind: 'chirp_sandals' } },
  { id: 'eve_076', name: 'Miss', description: '-------Miss-------', awardsPoints: false, effect: { kind: 'nothing' } },

  // EVE_080 - EVE_088: Seasonal / Sale events (all 1 turn)
  { id: 'eve_080', name: 'Snowstorm', description: 'There is a snowstorm. All items are 50% off until next turn.', awardsPoints: true, effect: { kind: 'global_sale', priceMultiplier: 0.5, rounds: 1 } },
  { id: 'eve_081', name: 'Hurricane', description: 'There is a hurricane outside. All items are 50% off until next turn.', awardsPoints: true, effect: { kind: 'global_sale', priceMultiplier: 0.5, rounds: 1 } },
  { id: 'eve_082', name: 'Halloween Sale', description: 'Halloween sale. All items are 30% off for one turn.', awardsPoints: true, effect: { kind: 'global_sale', priceMultiplier: 0.7, rounds: 1 } },
  { id: 'eve_083', name: 'Christmas Sale', description: 'Santa: Merry Christmas! All items are 50% off for one turn.', awardsPoints: true, effect: { kind: 'global_sale', priceMultiplier: 0.5, rounds: 1 } },
  { id: 'eve_084', name: 'Final Sale', description: 'Final Sale. All items are 70% off for one turn.', awardsPoints: true, effect: { kind: 'global_sale', priceMultiplier: 0.3, rounds: 1 } },
  { id: 'eve_085', name: 'Spring Sale', description: 'Spring Sale. All items are 50% off for one turn.', awardsPoints: true, effect: { kind: 'global_sale', priceMultiplier: 0.5, rounds: 1 } },
  { id: 'eve_086', name: 'Summer Sale', description: 'Summer Sale. All items are 50% off for one turn.', awardsPoints: true, effect: { kind: 'global_sale', priceMultiplier: 0.5, rounds: 1 } },
  { id: 'eve_087', name: 'Fall Sale', description: 'Fall Sale. All items are 50% off for one turn.', awardsPoints: true, effect: { kind: 'global_sale', priceMultiplier: 0.5, rounds: 1 } },
  { id: 'eve_088', name: 'Winter Sale', description: 'Winter Sale. All items are 50% off for one turn.', awardsPoints: true, effect: { kind: 'global_sale', priceMultiplier: 0.5, rounds: 1 } },
];
