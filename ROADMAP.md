# Top Shop Prototype — Current State & Next Steps

## Implemented
- **All 10 Official PS1 Stages (`src/config/maps/`, `src/config/map1.ts`):** Stages 1–10 (`stage_0`–`stage_9`, `11×3` through `16×4` and `11×5`) matching `SLUS_013.33` (`0x800acd14`), with `0`-step `=` hallway bridges, split escalator cap/body topology, center crossover escalators (`byEntryDir`), 3-floor express escalators, dual elevator shafts (`A`/`B`), topbar stage switcher, smooth CSS token overlay, SVG route preview (`Routes` toggle), keyboard (`Arrows`/`WASD`/`Space`/`Esc`) + click-to-walk `LAND` targets, and 1-step / `ESCALATOR_UNDO`.
- **Stores & Economy (`src/config/stores*.ts`, `src/config/areaPools.ts`, `src/engine/shops*.ts`):** Full 44-store / 264-item catalog and 11 official `AREA_POOLS`, segment exclusivity, EXE cashback curve (`2%`–`12%`), EXE shop asset & buyout formulas (`emptyBaseCost = 5× base`), rank-adjusted shopping points (`65%`, `99`-pt cap), L1–L4 chain upgrades, manual delivery, and end-of-turn liquidation/bankruptcy.
- **Calendar, Rubber-Banding & Events (`src/config/events.ts`, `src/config/eventTables.ts`, `src/engine/eventDraw.ts`, `src/engine/events.ts`):** Exact 55 reachable US Event cards, 12-month fiscal calendar (Year 1 April start advancing each round), monthly Seasonal Sale table (`0x800ade20`), 49×8 PS1 weighted rubber-banding draws (`0x800adc64`), `totalMonths`-scaled cash events, random `1–3` event points (`0` for `Miss`), global sales, elevator locks, turn skips/reversals, and store prompts (`EVENT_PICK_STORE`).
- **Bank Point Exchange (`src/config/bankRewards.ts`, `src/engine/bank*.ts`, `src/ui/bankPanel.ts`):** Full 53-item catalog aligned to `SLUS_013.33` (`0x800abf9c`), eligibility/target helpers, cancel point refunds, payday modifiers, pencil overrides, 2x store prices (`4 turns`), store-count cash rewards/penalties, cash swaps/fractions, and store capture/close/upgrade/delivery rewards.

## Binary Verification Status (`SLUS_013.33`)
- All prior `// VERIFY` items (US store spellings, Crane Game `208` / Refrigerator `896`, Cash Back curve, asset/buyout math, shopping points, 55-card Event catalog + weights + seasonal calendar, all 11 `AREA_POOLS`, all 10 stage grids/escalators/elevators, and Bank Point Exchange labels) have been verified against `SLUS_013.33` and synced into `src/`.

## Next Vertical Slices (Recommended Order)
1. **Match Setup Screen & Persistence:** Pre-match UI (player count/names/colors, Target Assets, Starting Cash, Bankrupt Limit, Map selector) + `localStorage` match save/load + JSON config export/import.
2. **AI Bot Players:** Heuristic bot controller in `src/engine/bot.ts` (auto-picks direction toward unowned/own stores, buys/delivers/redeems points) for fast solo playtesting.
3. **Online P2P Multiplayer & GitHub Pages Deploy:**
   - Add `vite.config.ts` (`base: './'`) and `.github/workflows/deploy.yml` for GitHub Pages.
   - Wrap `applyAction` over WebRTC (`Trystero` or `PeerJS`) with host-authoritative state sync and seat assignment.
