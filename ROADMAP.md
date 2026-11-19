# Top Shop Prototype — Current State & Next Steps

## Implemented
- **All 10 Official PS1 Stages (`src/config/maps/`, `src/config/map1.ts`):** Stages 1–10 (`stage_0`–`stage_9`, `11×3` through `16×4` and `11×5`) matching `SLUS_013.33` (`0x800acd14`), with verified per-stage `lapSteps` (`[36, 30, 58, 54, 45, 42, 36, 44, 72, 46]`), `0`-step `=` hallway bridges, split escalator cap/body topology, center crossover escalators (`byEntryDir`), 3-floor express escalators, dual elevator shafts (`A`/`B`), topbar stage switcher, smooth CSS token overlay, SVG route preview (`Routes` toggle), keyboard (`Arrows`/`WASD`/`Space`/`Esc`) + click-to-walk `LAND` targets, and 1-step / `ESCALATOR_UNDO`.
- **Stores & Economy (`src/config/stores*.ts`, `src/config/areaPools.ts`, `src/engine/shops*.ts`):** Full 44-store / 264-item catalog and 11 official `AREA_POOLS`, segment exclusivity, EXE cashback curve (`2%`–`12%`), EXE shop asset & buyout formulas (`emptyBaseCost = 5× base`), rank-adjusted shopping points (`65%`, `99`-pt cap), vandalism buyout enforcement (`0x80046328`), L1–L4 chain upgrades, manual delivery, and end-of-turn liquidation/bankruptcy (`0x8005dff0`, `75%`).
- **Calendar, Rubber-Banding & Events (`src/config/events.ts`, `src/config/eventTables.ts`, `src/engine/eventDraw.ts`, `src/engine/events.ts`):** Exact 55 reachable US Event cards, face-down 3-card shuffled triple draw (`REVEAL_EVENT_CARD` + `PICK_EVENT_CARD`), 12-month fiscal calendar (Year 1 April start advancing each round), monthly Seasonal Sale table (`0x800ade20`), 49×8 PS1 weighted rubber-banding draws (`0x800adc64`), `totalMonths`-scaled cash events, random `1–3` event points (`0` for `Miss`), global sales, elevator locks, turn skips/reversals, `"Chirp-Chirp"` Sandals (`0x80054554`), and store prompts (`EVENT_PICK_STORE`).
- **Bank Payday & Point Exchange (`src/config/bankRewards.ts`, `src/engine/bank*.ts`, `src/engine/movementLanding.ts`, `src/ui/bankPanel.ts`):** Exact PS1 Bank Payday formula (`0x80076270`) using per-player `bankVisits`, per-stage `lapSteps`, `floor(netWorth / 10)`, `(25 + floor(75 * stepsSincePayday / lapSteps))%`, and `1.5×` exact-landing bonus; full 53-item catalog aligned to `SLUS_013.33` (`0x800abf9c`), cancel point refunds, payday modifiers, pencil overrides, 2x store prices (`4 turns`), store-count cash rewards/penalties, cash swaps/fractions, and store capture/close/upgrade/delivery rewards.
- **Match Setup Screen & Persistence (`src/ui/setupModal.ts`, `src/ui/persistence.ts`, `src/ui/topbar.ts`):** Pre-match configuration dialog (2–4 players, custom names & hex colors/swatches, Target Assets, Starting Cash, Bankrupt Limit, Finish Round on Win, and 10-stage selector), automatic + manual `localStorage` match save/load slots, and JSON config export/import (`top-shop-config.json`).
- **Online P2P Multiplayer (`src/net/`, `src/ui/lobbyModal.ts`):** Host-authoritative WebRTC star topology (`PeerJS`), private 6-char Room Codes + `?room=` links, per-tab `sessionStorage` `clientToken` reconnects, hybrid Local + Online seat assignments (`P1`–`P4`), client-side 3D pencil skill-stop + live spin broadcast (`UI_PENCIL_SPIN`), hidden event redaction (`hidden_0..2`) until `REVEAL_EVENT_CARD`, Host-only escalator ticking, and spectator lockouts.

## Binary Verification Status (`SLUS_013.33`)
- All gameplay constants, formulas, and content (US store spellings, Crane Game `208` / Refrigerator `896`, Cash Back curve, asset/buyout/liquidation math, Bank Payday `0x80076270`, shopping points, vandalism buyout block `0x80046328`, `"Chirp-Chirp"` Sandals behavior `0x80054554`, 55-card Event catalog + weights + seasonal calendar, all 11 `AREA_POOLS`, all 10 stage grids/lapSteps/escalators/elevators, and Bank Point Exchange labels) have been verified against `SLUS_013.33` and synced into `src/`.

## Online Multiplayer & Deploy Slices
1. **Online P2P Multiplayer & Portable Build:**
   - [x] **Slice A — Engine 2-Step Event Reveal & Action Validator:** `REVEAL_EVENT_CARD` / `revealedEventSlot`, `redactStateForClient`, and runtime `isValidGameAction` validator in `src/engine/`.
   - [x] **Slice B — WebRTC Transport (`src/net/`):** `PeerJS` host/guest session manager, per-tab `clientToken` seat registry, hidden-card scrubbing before reveal, Host-only escalator ticking, and seq-gated stepping.
   - [x] **Slice C — Multiplayer Lobby & Spectator UI (`src/ui/`):** Room Code host/join modal (`?room=` invite links), per-seat Local vs Online assignment + kick/reassign controls, live topbar/HUD badges, and Guest spectator lockouts.
   - [x] **Slice D — Private Testing & Portable Build Setup:** Portable `vite.config.ts` (`base: './'`, LAN `host: true`), per-tab `sessionStorage` tokens + **Open Guest Tab** shortcut, and manual-only `.github/workflows/deploy.yml` (`workflow_dispatch`, no auto-deploy on push).

## Private Testing Guide (Before Going Public)
- **Same-PC Multi-Tab Testing:**
  1. Run `npm.cmd run dev` and open `http://localhost:5173`.
  2. Open **Online Lobby → Host Online Room** in Tab 1.
  3. Click **Open Guest Tab** inside the Lobby modal (each browser tab generates its own `sessionStorage` `clientToken` and auto-opens the Join modal with `?room=<CODE>`), then click **Join Room**.
  4. Use the Host's Lobby modal to mix Local (`Host`) and Online (`Guest`) seat assignments across `P1`–`P4`.
- **Home Wi-Fi / LAN Testing:**
  1. Run `npm.cmd run dev`. Vite prints a `Network: http://192.168.x.x:5173` URL because `server.host` is `true` in `vite.config.ts`.
  2. Open that LAN URL on another laptop, tablet, or phone on the same Wi-Fi and enter the Host's 6-character Room Code (Note: desktop/LAN browsers outside `localhost` may require HTTPS for `navigator.clipboard`; typing the 6-char room code manually works everywhere).

## Next Vertical Slices — 2D Mall Visual Polish & Animation
- [x] **Visual Slice 1 — Architectural Foundation (`src/ui/boardView.ts`, `src/ui/stateDiff.ts`, `src/ui/fxOverlay.ts`):**
  - Keep board tile DOM elements persistent per stage load (patching classes/contents in place instead of wiping `innerHTML` every turn) and isolate floating token animations on inner `.token-body` layers.
  - Client-side `prevState -> nextState` diff hook driving floating `+$`/`-$`/`pts` popups, tile pulses, and standee animations identically for local and remote `STATE_SYNC` turns without touching `src/engine/` or `src/net/`.
- [x] **Visual Slice 2 — Storefronts, 44 Icons, Chains, Shelves, Card Flips, Standee FX & SFX:**
  - **Retro Mall Theme & Storefronts (`src/config/storeVisuals.ts`, `src/ui/storeTileView.ts`, `src/styles.css`):** Floor parity shading, `44` store SVG emblems, striped `--owner-color` awnings, dashed `Tenant Wanted` lots, merged L2–L4 chain borders, rolling `CLOSED` metal shutters, `3–6` tier-coded shelf pips, plus gold Bank / steel Elevator / diagonal Escalator styling.
  - **Standee Micro-Animations & Audio (`src/ui/eventPanel.ts`, `src/ui/soundFx.ts`, `src/ui/topbar.ts`):** Step hops with squash-and-stretch, `horizontalDir` lean, escalator glides, elevator teleports, Payday celebrations, hurt shakes, staggered 3D Event card flips, and synthesized Web Audio retro SFX + `SFX` toggle.
- [x] **Visual Slice 3 — Animal Standee Builder & Color-Coded Token Framing:**
  - Cute flat-vector inline SVG animal presets (species, primary fur/scale color, secondary muzzle/ear/chest color, eyes/accessories, and `Randomize`) usable in `Match Setup` and `Online Lobby`, rendered inside `player.color`-framed board tokens + HUD badges.
- [x] **Visual Slice 4 — Custom Image Upload, Interactive Manual Cropper & Online `AVATAR_SYNC`:**
  - Raster image uploader (`PNG`/`JPG`/`WebP`/`GIF`/`AVIF`) with drag-and-zoom crop overlay, `<canvas>` downsampling (`64×64`–`96×96`, `<= 12 KB`, never raw SVG), `player.color` standee ring + `P1`–`P4` corner pip, and session-scoped `AVATAR_SYNC` / `HELLO` peer distribution.

## Future / Optional (Maybe Later)
- **Tier 3 — Hybrid 2D Animated Mall Cross-Section (PixiJS + HTML/CSS UI):** Replace the CSS Grid board with a 2D WebGL canvas (`PixiJS`) featuring animated scrolling escalator treads, moving elevator cars between floors, walking customers/cashiers inside open stores, character reaction portraits on Events/Bank visits, illustrated icons across all 264 items, and smooth camera zoom/pan for larger stages (`16×4`, `11×5`), while keeping menus/modals in HTML/CSS.
- **AI Bot Players:** Heuristic bot controller in `src/engine/bot.ts` (auto-picks direction toward unowned/own stores, buys/delivers/redeems points) for solo play.
