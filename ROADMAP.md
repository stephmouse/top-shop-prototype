# Top Shop Prototype — Current State & Next Steps

## Implemented
- **All 10 Official PS1 Stages (`src/config/maps/`, `src/config/map1.ts`):** Stages 1–10 (`stage_0`–`stage_9`, `11×3` through `16×4` and `11×5`) matching `SLUS_013.33` (`0x800acd14`), with verified per-stage `lapSteps` (`[36, 30, 58, 54, 45, 42, 36, 44, 72, 46]`), `0`-step `=` hallway bridges, split escalator cap/body topology, center crossover escalators (`byEntryDir`), 3-floor express escalators, dual elevator shafts (`A`/`B`), topbar stage switcher, smooth CSS token overlay, SVG route preview (`Routes` toggle), keyboard (`Arrows`/`WASD`/`Space`/`Esc`) + click-to-walk `LAND` targets, and 1-step / `ESCALATOR_UNDO`.
- **Stores & Economy (`src/config/stores*.ts`, `src/config/areaPools.ts`, `src/engine/shops*.ts`):** Full 44-store / 264-item catalog and 11 official `AREA_POOLS`, segment exclusivity, EXE cashback curve (`2%`–`12%`), EXE shop asset & buyout formulas (`emptyBaseCost = 5× base`), rank-adjusted shopping points (`65%`, `99`-pt cap), vandalism buyout enforcement (`0x80046328`), L1–L4 chain upgrades, manual delivery, and end-of-turn liquidation/bankruptcy (`0x8005dff0`, `75%`).
- **Calendar, Rubber-Banding & Events (`src/config/events.ts`, `src/config/eventTables.ts`, `src/engine/eventDraw.ts`, `src/engine/events.ts`):** Exact 55 reachable US Event cards, face-down 3-card shuffled triple draw (`REVEAL_EVENT_CARD` + `PICK_EVENT_CARD`), 12-month fiscal calendar (Year 1 April start advancing each round), monthly Seasonal Sale table (`0x800ade20`), 49×8 PS1 weighted rubber-banding draws (`0x800adc64`), `totalMonths`-scaled cash events, random `1–3` event points (`0` for `Miss`), global sales, elevator locks, turn skips/reversals, `"Chirp-Chirp"` Sandals (`0x80054554`), and store prompts (`EVENT_PICK_STORE`).
- **Bank Payday & Point Exchange (`src/config/bankRewards.ts`, `src/engine/bank*.ts`, `src/engine/movementLanding.ts`, `src/ui/bankPanel.ts`):** Exact PS1 Bank Payday formula (`0x80076270`) using per-player `bankVisits`, per-stage `lapSteps`, `floor(netWorth / 10)`, `(25 + floor(75 * stepsSincePayday / lapSteps))%`, and `1.5×` exact-landing bonus; full 53-item catalog aligned to `SLUS_013.33` (`0x800abf9c`), cancel point refunds, payday modifiers, pencil overrides, 2x store prices (`4 turns`), store-count cash rewards/penalties, cash swaps/fractions, and store capture/close/upgrade/delivery rewards.
- **Match Setup Screen & Persistence (`src/ui/setupModal.ts`, `src/ui/persistence.ts`, `src/ui/stateValidation.ts`, `src/ui/topbar.ts`):** Pre-match configuration dialog (2–6 players, custom names & hex colors/swatches, Target Assets, Starting Cash, Bankrupt Limit, Finish Round on Win, and 10-stage selector), automatic + manual `localStorage` match save/load slots validated with `SAVE_SCHEMA_VERSION`, and JSON config export/import (`top-shop-config.json`).
- **Online P2P Multiplayer (`src/net/`, `src/ui/lobbyModal.ts`):** Host-authoritative WebRTC star topology (`PeerJS`) backed by a pure host router (`src/net/hostRouter.ts`) and separate guest transport (`src/net/guestTransport.ts`), `crypto.getRandomValues` 6-char Room Codes + `?room=` links, per-tab `sessionStorage` `clientToken` reconnects (host-only token mapping + opaque `guest_N` roster IDs with zero token/`peerId` leakage), hybrid Local + Online seat assignments (`P1`–`P6`), client-side 3D pencil skill-stop + live spin broadcast (`UI_PENCIL_SPIN`), hidden event redaction (`hidden_0..2`) until `REVEAL_EVENT_CARD`, Host-only escalator ticking, and spectator lockouts.

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
  4. Use the Host's Lobby modal to mix Local (`Host`) and Online (`Guest`) seat assignments across `P1`–`P6`.
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
  - Raster image uploader (`PNG`/`JPG`/`WebP`/`GIF`/`AVIF`) with drag-and-zoom crop overlay, `<canvas>` downsampling (`64×64`–`96×96`, `<= 12 KB`, never raw SVG), `player.color` standee ring + `P1`–`P6` corner pip, and session-scoped `AVATAR_SYNC` / `HELLO` peer distribution.

## Near-Term Roadmap (Soon / Next Step)
- **Victory Celebration Modal, Match Stats & Asset History Graph (Playtest #2 #26):** Pop-up modal on `GAME_OVER` with winner avatar/trophy/confetti burst, win condition label, short Web Audio victory jingle (`src/ui/soundFx.ts`), ranked standings + fun match stats (Cash Backs, Buyouts, Events Drawn), and a historical SVG line graph tracking each player's net worth sampled once per round/month.
- **UI Theme Presets & Custom Interface Colors (Playtest #2 #27):** Refactor hardcoded surface hexes in `src/styles.css` into semantic CSS variables and add a client-side (`localStorage`) Themes & Custom Colors selector featuring 4–5 curated presets (`Midnight Mall`, `Retro PS1 Mall`, `Sakura Pastel`, `Arcade Neon`, `Daylight`) plus Background/Panel/Accent color pickers with contrast-safe auto-derivation.
- **Color-Coded Cash Amounts (Potential UI Polish):** Highlight `$` amounts across choice panels, Match Log, Player HUD, Store Inspector, and tile stats via a single DOM-safe text helper (text nodes + `<span class="cash-amt">`, zero `innerHTML`) backed by themeable CSS variables (`--cash-color` / optional `--cash-loss-color` for negative amounts), with contrast-safe overrides on bright `.primary` buttons and existing map badges.
- **1-per-Player Signature Store (Playtest #2 #19, #29, #29a):** Allow each player to customize 1 personal store (custom name, built-in icon from `STORE_ICON_PATHS`, 6 custom item names) synced once out-of-band on join/profile update (0 bytes added to per-turn `STATE_SYNC`). Appears as an optional 4th choice (`★ Open as [Signature Store]`) alongside the normal 3 stores in segments where the high-value store is unowned and the player's Signature Store isn't currently on the board; keeps real PS1 `storeTypeId` (identical costs/prices/exclusivity) plus an optional `signatureOwnerId` flag; usable in 1 segment at a time (expands L1–L4, returns to pocket if completely wiped out/sold); Bank captures (`bank_15`/`41`/`51`) let the capturing player convert into their own unused Signature Store or the segment's standard high-value store.

## Optional House Rules & Alternate Modes
*Per Playtest #2 #28: Authentic PS1 rules always remain the default; all gameplay-altering additions live strictly behind opt-in Match Setup toggles.*
- **Elevators Always Change Floors (Playtest #2 #11):** Exclude the current floor when rolling elevator destination stops (PS1 default includes current floor).
- **Inflation Mode (Playtest #2 #23):** Two alternate inflation rulesets under one setting — (a) **Cosmetic Currency Multiplier** (scales displayed dollar amounts, e.g. `2×`/`10×`, without changing game math) and (b) **Annual Price Inflation** (store/item prices inflate each fiscal year while starting cash stays fixed).
- **Weighted Event Points (Playtest #2 #14):** Award more Shopping Points for negative Event cards than positive ones (PS1 default awards uniform `1–3` pts on all non-Miss events).
- **Selective / Non-Blind Events (Playtest #2 #7, #32 — low-priority "big maybe"):** Opt-in house rule to either preview all 3 drawn Event cards before choosing or spend Shopping Points to swap/re-draw an Event card.

## Future Networking Milestone — TURN Relay, NAT Traversal & IP Privacy (Phase 3B)

Deferred while friend playtesting goes smoothly on direct connections; useful when friends play over mobile or restricted Wi-Fi:

### Why STUN-Only Can Drop Friend Connections
1. **CGNAT & Strict NAT Failures:** Players on 4G/5G carrier-grade NAT (CGNAT), symmetric NATs, or restricted campus/corporate Wi-Fi often cannot establish direct STUN-only P2P connections and hit the 15-second join timeout.
2. **Host & Guest IP Address Exposure:** Even with `clientToken` and PeerJS `peerId` removed from broadcast `RoomRoster` payloads, direct WebRTC ICE negotiation (`host` and `srflx` candidates) exchanges real IP addresses between the host and each connected guest at the browser `RTCPeerConnection` layer.

### Planned Architecture (Safe for Static GitHub Pages)
1. **Ephemeral TURN Credential Worker:** Never embed static TURN credentials in the public client bundle. Deploy a lightweight serverless endpoint (e.g., a Cloudflare Worker calling Cloudflare Calls TURN API, or Metered.ca short-lived credentials) with origin checks and rate limiting that returns short-lived `iceServers` entries.
2. **Runtime ICE Config Loader (`src/net/iceConfig.ts` / `src/net/avatarSync.ts`):** Fetch short-lived `iceServers` from a configurable `VITE_TURN_CREDENTIAL_URL` when hosting or joining, falling back cleanly to STUN-only when unset for local development and private playtesting.
3. **Optional IP-Privacy Relay Mode (`iceTransportPolicy: 'relay'`):** When TURN credentials are active, support passing `iceTransportPolicy: 'relay'` into PeerJS's `RTCPeerConnection` config (as an opt-in Lobby toggle) so browsers emit only `relay` ICE candidates and never expose raw host or guest IP addresses to each other.

## Future / Optional (Maybe Later)
- **Tier 3 — Hybrid 2D Animated Mall Cross-Section (PixiJS + HTML/CSS UI):** Replace the CSS Grid board with a 2D WebGL canvas (`PixiJS`) featuring animated scrolling escalator treads, moving elevator cars between floors, walking customers/cashiers inside open stores, character reaction portraits on Events/Bank visits, illustrated icons across all 264 items, and smooth camera zoom/pan for larger stages (`16×4`, `11×5`), while keeping menus/modals in HTML/CSS.
  - **Physical Escalator & Hallway Token Paths:** Once actual mall visuals are in place, animate player tokens so they physically follow the escalator steps/rails up and down on screen (including multi-floor express towers and crossover hallways), rather than the placeholder direct tile-to-tile glide.
- **Custom Stages & Experimental Tile Types (Playtest #2 #24):** Additional custom mall layouts (including middle-floor Banks, which `src/config/maps/builder.ts` already supports out of the box) and experimental new tile types kept separate from the 10 authentic PS1 stages.
