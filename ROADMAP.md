# Top Shop Prototype — Current State & Next Steps

## Implemented
- **Board & Movement:** Map 1 (`src/config/map1.ts`, 11×3), smooth CSS token overlay, SVG route preview + static escalator links (`Routes` toggle), keyboard (`Arrows`/`WASD`/`Space`/`Esc`) + click-to-walk `LAND` targets, 1-step undo + `ESCALATOR_UNDO`.
- **Stores:** Full 44-store / 264-item catalog (`src/config/stores*.ts`), segment exclusivity, L1–L4 chain upgrades, auto-stocked openings/buyouts, manual delivery to any owned tile, Cash Back refunds, negative-cash liquidation & bankruptcy.
- **Events:** Full 51-card catalog (`src/config/events.ts`) & effect handlers (`src/engine/events.ts`), including global sales, elevator locks, turn skips/reversals, and store prompts (`EVENT_PICK_STORE`).

## Items Marked `// VERIFY` (Manual Check Against PS1 Disc/Emulator)
- `src/config/storesPart1.ts`: `Arcade Games` Crane Game (`208` vs Dreen `108`), `Electrical Goods` Refrigerator (`896` vs Dreen `856`).
- `src/config/stores.ts`: `baseOpenCost = 12 * base` (verified on 6 stores in manual) and placeholder `cashbackChance` curve.
- `src/config/events.ts`: Point awards (`0–3`), cash gift/collection tiers (`EVE_035–037`, `040–042`), and seasonal sale names/discounts for `EVE_083, 085, 086, 088`.
- `src/config/map1.ts`: Placeholder 4-store segment pools (`SEGMENT_POOLS`).

## Next Vertical Slices (Recommended Order)
1. **Full 53-Item Bank Point Exchange:** Move `BANK_REWARDS` into `src/config/bankRewards.ts` and implement all 53 effects in `src/engine/bank.ts` (next-payday modifiers, pencil overrides `1s/2s`/`E only`/`slow`, price doubling, store-count cash/penalties, player cash swaps/cuts, take/close out-of-stock/level-N stores).
2. **Match Setup Screen & Persistence:** Pre-match UI (player count/names/colors, Target Assets, Starting Cash, Bankrupt Limit, Map selector) + `localStorage` match save/load + JSON config export/import.
3. **AI Bot Players:** Simple heuristic bot controller in `src/engine/bot.ts` (auto-picks direction toward unowned/own stores, buys/delivers/redeems points) for fast solo playtesting.
4. **Online P2P Multiplayer & GitHub Pages Deploy:**
   - Add `vite.config.ts` (`base: './'`) and `.github/workflows/deploy.yml` for GitHub Pages.
   - Wrap `applyAction` over WebRTC (`Trystero` or `PeerJS`) with host-authoritative state sync and seat assignment.