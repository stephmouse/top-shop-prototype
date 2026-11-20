# Top Shop Prototype

A browser-based TypeScript & Vite recreation of the PS1 board and store-management game ***Top Shop*** (`SLUS-013.33`), featuring deterministic turn logic, all 10 official stages, 2–6 player support, custom animal/photo standees, and serverless online P2P multiplayer.

> **Note:** Fan-made prototype built for preservation and playtesting. Gameplay rules, economy formulas, event tables, and stage layouts are modeled after the US release (`SLUS-013.33`).

---

## How the Game Works (Player Guide)

Players race around a multi-floor shopping mall, opening and upgrading stores, stocking shelves, buying from rivals, and collecting Bank Paydays until someone reaches the **Target Assets** goal (or enough rivals go bankrupt).

### 1. Rolling & Moving Around the Mall
- **9-Sided Pencil Die (`1`–`8` & `E`):** Spin and skill-stop the 3D Pencil Die to roll 1–8 steps, or land on **`E`** to trigger a random Event.
- **Directional Locks:** Horizontal (`←` / `→`) and vertical (`↑` / `↓`) movement directions lock independently as you travel. Landing on (or passing) the **Bank**, stopping at an **Elevator**, or triggering certain Events unlocks your direction (`?`).
- **Route Preview & Pathing:** Toggle **`Routes`** in the top bar to see reachable paths and **`LAND`** target tiles. Enable **`Auto-Move`** to step automatically, or step manually with **Arrow keys / `WASD`** or by clicking highlighted tiles.
- **Undo & Reset:** Step backward 1 tile with the opposite direction key, or press **`Esc`** (`Reset Move` / `Change Route`) to rewind your move before committing an action.
- **Mall Shortcuts:**
  - **`=` Hallway Bridges:** Consume `0` movement steps.
  - **Escalators:** Stepping onto an escalator automatically glides you to the connected floor (`0` extra steps). Includes split escalators, center crossovers, and 3-floor express escalators.
  - **Elevators (`A` / `B`):** Prompt you to ride between floors and unlock your direction when you stop.

### 2. Stores, Chains & Economy
- **44 Store Types / 264 Items:** All 11 official area pools are included. Only one player may own a given store type within the same mall segment.
- **Opening & Buyouts:** Land on a vacant `Tenant Wanted` lot to open a new store (auto-stocked with starter items), or buy out a rival's store (`1.5×`–`3×` empty store value based on chain level).
- **Chains (L1–L4):** Adjacent same-owner stores in the same segment merge borders into **L1–L4** chains, expanding shelf capacity (`3` → `4` → `5` → `6` slots) and unlocking higher-tier, higher-margin merchandise.
- **Delivering Stock:** Landing on your own store lets you restock shelves manually from unlocked tiers up to the store's capacity.
- **Shopping at Rival Stores:** Landing on a rival's open store lets you buy up to 2 items. Purchases have a chance to trigger a **Cash Back** refund and award **Shopping Points** (`0`–`99` cap, rank-adjusted). Buying out a store's last item lets you immediately buy the empty slot!
- **Liquidation & Bankruptcy:** Ending a turn with negative cash forces you to liquidate owned stores at **75%** asset value (`SELL_SHOP_LIQUIDATE`) or go **Bankrupt**.

### 3. Bank Paydays & Point Exchange
- **Payday Salary:** Passing or landing on the **Bank** pays a salary based on your net worth, number of Bank visits, stage lap length, and steps traveled since your last payday — with a **1.5× bonus** for landing on the Bank exactly.
- **53-Item Point Exchange:** Spend Shopping Points at the Bank on rewards ranging from cash bonuses, payday multipliers, forced Pencil rolls, and `2×` store prices (`4` turns) to store upgrades, free deliveries, rival store closures (`CLOSED` rolling shutters), and store captures. Toggle **`Usable Only`** to filter affordable options; canceling a Bank prompt refunds your points.

### 4. Fiscal Calendar & Events
- **12-Month Calendar:** Matches start in **Year 1 · April** and advance one month each full round, triggering monthly **Seasonal Sales**.
- **55-Card Weighted Event Deck:** Landing on an Event (or rolling `E`) deals 3 face-down cards drawn using rank/deficit rubber-banding weights. Flip one to reveal and resolve it (`1–3` bonus points, cash gifts/penalties, global sales, elevator locks, `"Chirp-Chirp"` Sandals, turn skips/reversals, or store buy/sell prompts).

---

## Visuals, Audio & Standee Customizer

- **Retro Mall Board:** Floor parity shading, striped player-colored store awnings, custom SVG emblems for all 44 store types, tier-coded shelf stock pips, merged chain borders, rolling `CLOSED` shutters, and floating `+$` / `-$` / `pts` popups with standee hop, glide, teleport, celebrate, and hurt animations.
- **Retro Web Audio SFX:** Toggle **`SFX`** in the top bar for synthesized movement, dice, cash, event flip, and payday sounds.
- **Animal Standee Builder & Photo Cropper:** Click any player's portrait in **Match Setup** or **Online Lobby** to customize:
  - **16 Animal Species:** Mouse, Dragon, Kangaroo, Dog, Wolf, Fox, Beaver, Skunk, Cat, Raccoon, Horse, Otter, Deer, Frog, Panda, and Bunny.
  - **Layer Customization:** 8 coat/fur markings, 7 hairstyles, 5 eye moods, 9 accessories (including thick-rimmed black glasses), 4 custom color pickers, **`Species Palette`**, and **`Randomize`**.
  - **Custom Image Upload:** Click **`Upload Photo…`** (`PNG`, `JPG`, `WebP`, `GIF`, or `AVIF`) to open the interactive circular cropper (drag to pan, slider/scroll to zoom), automatically downsampled on `<canvas>` and framed inside the player's color-coded standee ring and `P1`–`P6` corner pip.

---

## 2–6 Players, Match Setup & Online Multiplayer

- **Match Setup & Persistence:**
  - Configure **2–6 players**, names, hex colors/swatches, **Target Assets**, **Starting Cash**, **Bankrupt Limit**, **Finish Round on Win**, and any of the **10 official stages** (`Stage 1`–`Stage 10`, `11×3` to `16×4` and `11×5`).
  - Quick-start presets **`New 2P`**–**`New 6P`** are available directly in the top bar.
  - Auto-save and manual Save/Load slots use `localStorage`, and full setups can be exported/imported as `top-shop-config.json`.
- **Online P2P Multiplayer (`Online Lobby`):**
  - Serverless host-authoritative WebRTC rooms via **PeerJS** — click **Host Online Room** to generate a 6-character Room Code and shareable `?room=` invite link (or **`Open Guest Tab`** to test multiple tabs locally).
  - **Hybrid Seats & Spectators:** Host can assign any of `P1`–`P6` to local couch play (`Host`) or connected `Guest` peers, add extra player slots mid-lobby, or kick/reclaim seats. Extra guests join as spectators.
  - **Fair-Play Sync:** Host owns the clock, escalator ticks, RNG seed, and hidden Event card redaction until reveal; Guests see live 3D Pencil spins and receive custom portraits once per session via `AVATAR_SYNC`.

---

## Controls

- **Roll / Advance:** Click the 3D Pencil Die or press `Space`.
- **Move:** `Arrow Keys` / `WASD`, or click highlighted next-step / `LAND` target tiles directly.
- **Undo / Reset:** Press the opposite direction key for 1-step undo, or `Esc` to reset the current move (also closes open modals).

---

## Local Development

```bash
# Install dependencies
npm install

# Start Vite dev server (localhost:5173 + LAN network URL)
npm run dev

# Type-check and build static bundle into dist/
npm run build

# Preview production build (port 4173)
npm run preview
```

> **Windows PowerShell tip:** If PowerShell blocks `npm.ps1`, use `npm.cmd` (e.g. `npm.cmd run build`).

---

## Architecture

- `src/config/` — Pure static catalogs (stores, items, area pools, events, bank rewards, 10 stage layouts, avatar parts/types).
- `src/engine/` — Pure, deterministic, DOM-free game state machine (`applyAction(state, action)`).
- `src/net/` — Host-authoritative PeerJS WebRTC transport, message validation, and out-of-band `AVATAR_SYNC`.
- `src/ui/` — CSS Grid mall renderer, SVG overlays, animations, Web Audio SFX, image cropper, modals, and persistence.

See [ROADMAP.md](ROADMAP.md) for development history and planned future additions (AI bots, Tier 3 animated 2D mall canvas).

---

## Deployment (GitHub Pages)

The workflow at `.github/workflows/deploy.yml` builds `dist/` (`base: './'` in `vite.config.ts`) and deploys to GitHub Pages when triggered in **Actions → Deploy Static Site to GitHub Pages** (with **Settings → Pages → Source** set to **GitHub Actions**).
