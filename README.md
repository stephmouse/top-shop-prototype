# Top Shop Prototype

An unofficial, browser-based TypeScript & Vite fan recreation of the PlayStation board and store-management game ***Board Game: Top Shop*** (originally released in Japan as ***Tenant Wars***, US release `SLUS-013.33`).

> **Work-in-Progress Prototype:** This project is an active WIP prototype currently in early playtesting using CSS Grid, SVG, and synthesized Web Audio placeholder visuals. You can play the current build directly in your browser at **[stephmouse.github.io/top-shop-prototype](https://stephmouse.github.io/top-shop-prototype/)** (or run it locally—see [Contributing & Local Development](#contributing--local-development)).
>
> **AI-Assisted Development Notice:** This project was built with substantial **AI coding and reverse-engineering assistance** (alongside human design, direction, verification, and playtesting). I want to be upfront and transparent so anyone who prefers not to use AI-assisted projects can make an informed choice.

---

## Core Features (PS1 Recreation)

Gameplay formulas, stage layouts, store catalogs, and probability tables are modeled after the US PS1 release (`SLUS-013.33`):

- **All 10 Official Stages:** Full mall boards (`11×3` through `16×4` and `11×5`), hallway `=` bridges (`0` steps), directional escalators (including split, center crossover, and 3-floor express escalators), and dual elevator shafts (`A` / `B`).
- **9-Sided 3D Pencil Die (`1`–`8` & `E`):** Spin and skill-stop the Pencil Die to roll movement steps or trigger a random Event (`E`).
- **44 Store Types & 264 Items:** Complete catalog across all 11 official segment pools, with adjacent same-owner stores forming **L1–L4** chains (`3` → `6` shelf capacity) and unlocking higher-tier merchandise.
- **Authentic Cash Back & Economy:** Manual inventory delivery, rival store shopping (up to 2 items/visit) with **Shopping Points** (`0`–`99` cap), authentic PS1 **`2×` Cash Back** reverse-refunds, buyouts (`1.5×`–`3×` empty store value), and forced asset liquidation (`75%`) / bankruptcy on negative cash.
- **Bank Paydays & 53-Item Point Exchange:** Net-worth and lap-scaled Bank salary (`1.5×` bonus on exact Bank landings) plus the full 53-reward Point Exchange catalog.
- **12-Month Calendar & 55-Card Weighted Event Deck:** Matches start in **Year 1 · April**, trigger monthly **Seasonal Sales**, and deal 3 face-down cards weighted by rank/net-worth rubber-banding.

---

## New Features Beyond the Original PS1 Game

- **2–6 Players & Custom First Turn:** Expanded from 4 to 2–6 player seats with configurable **First Turn** selection (pick a specific player or **Random Player**).
- **Serverless Online P2P Multiplayer (Hybrid Local + Online):** Host WebRTC rooms directly in the browser via **PeerJS** with 6-character Room Codes and `?room=` invite links. Mix local couch seats (`Host`) and remote players (`Guest`) in the same match, accommodate extra viewers as Spectators, auto-lock connected guest slots in Match Setup, and update your name, color, or standee live after connecting (`UPDATE_PROFILE`).
- **Start Hub Landing Page & Persistence:** Dedicated **Start Hub** (`Home`) with unified standee customization, conditional **Resume Previous Match** / **Discard Save** for auto-saved games, manual Save/Load slots, and `top-shop-config.json` export/import.
- **Animal Standee Builder & Custom Photo Cropper:** Customize 16 animal species (coat markings, hairstyles, eye moods, accessories, and color pickers) or upload and crop a custom photo (`PNG`, `JPG`, `WebP`, `GIF`, `AVIF`) shared per session via `AVATAR_SYNC`.
- **Derg & Kanga's Custom Walk Shoes:** Pick your preferred shoe SFX pre-match in the Standee Customizer (**"Chirp-Chirp" Sandals**, **Squeak-Squeak Sneaks**, **Boing-Boing Boots**, **Tap-Dance Loafers**, **Honk-Honk Clogs**, **Jingle-Bell Slippers**, **Poot-Poot Boots**, or **Random**) with a **🔊 Test** button, then unlock them in-match via the 9-pt Bank reward or Event card.
- **Modern UI & Game-Feel Polish:** Reachable route previews with click-to-walk `LAND` targets, direct mall-map store picking (with 2-click `Confirm?` protection on targeted/destructive picks), flip-safe paced hold-to-walk & hold-to-undo, weighty escalator & elevator rides with arrival SFX, rolling HUD cash counters, two-beat bait-and-switch Cash Back popups, toggleable non-blocking Month popups, and a spiral-calendar Match Log.

---

## How to Play

### Getting Started
You can play the current prototype right now in your browser at **[stephmouse.github.io/top-shop-prototype](https://stephmouse.github.io/top-shop-prototype/)** (before a dedicated site launches later), or run it locally via [Contributing & Local Development](#contributing--local-development).

On the **Start Hub**, customize your standee, name, and shoes, then choose:
- **Play Local Match** — configure 2–6 seats, stage, rules, and turn order for couch/pass-and-play.
- **Host Online Session** — generate a Room Code & invite link for friends (or open another tab with `?room=CODE` to test solo).
- **Join Online Room** — enter a host's Room Code (or open an invite link) to join with your profile.

> **Online Multiplayer Note:** Anyone is welcome to jump in and host a match anytime—online rooms simply connect via private Room Codes / invite links with friends rather than a public server browser or random matchmaking.

### Gameplay Basics
1. **Goal:** Be the first player to reach the **Target Assets** goal (Cash + Owned Store Asset Value), or outlast rivals until the **Bankrupt Limit** is met.
2. **Roll & Move:** Spin and stop the **Pencil Die** (`1`–`8` steps, or `E` for an Event card). Your horizontal (`←` / `→`) and vertical (`↑` / `↓`) directions lock as you move until you pass/land on the **Bank**, stop at an **Elevator**, or hit a direction-unlocking Event.
3. **Explore the Mall:**
   - **`Tenant Wanted` (Vacant Lot):** Pay the opening cost to launch a store (auto-stocked with starter goods).
   - **Your Own Store:** Restock shelves (`Deliver`) up to your store's L1–L4 capacity (`3`–`6` items).
   - **Adjacent Stores:** Owning neighboring stores of different types in the same segment links them into a chain (L1 → L4), boosting capacity and unlocking higher-tier items.
   - **Rival Store:** Buy up to 2 items. You still earn **Shopping Points**, and Cash Back may refund **`2×`** an item's price right out of the owner's pocket! Clearing a store's last item lets you buy out the slot.
4. **Bank & Points:** Pass or land on the **Bank** for a Payday salary (`1.5×` on exact Bank landings), then optionally redeem Shopping Points in the **53-item Point Exchange** (1 reward per visit).
5. **Watch Your Cash:** If you finish a turn with negative cash, you must sell owned stores at `75%` asset value or go **Bankrupt**.

### Controls & Helpful Toggles
- **`Space` / `Enter`:** Spin or stop the 3D Pencil Die, or step forward while moving.
- **`Arrow Keys` / `WASD`:** Tap or hold to walk smoothly along your locked direction (automatically pauses safely at escalator direction flips so you won't bounce backward). Freshly press or hold the **opposite direction** to step backward (`Undo Step`).
- **`Esc`:** Reset your entire move (before committing a shop/bank/event action) or close open modals.
- **Mouse / Click:** Click highlighted next-step tiles or dashed **`LAND`** targets to auto-walk paths, and click highlighted mall stores directly (instead of just the list buttons) whenever picking stores for deliveries, Bank rewards, or Events.
- **Top Bar:** Toggle **`Routes`**, **`Auto-Move`**, or **`SFX`**, jump back to **`Home`**, open **`Match Setup`** or **`Online Lobby`**, Save/Load locally, or switch stages (`Stage 1`–`Stage 10`).

---

## Contributing & Local Development

Contributions, playtest reports, bug fixes, and PRs are welcome! Look at [ROADMAP.md](ROADMAP.md) for current milestones and future ideas (such as AI bot opponents and richer 2D canvas visuals).

### Commands
```bash
npm install        # Install dependencies
npm run dev        # Start Vite dev server (localhost:5173 + LAN host)
npm run build      # Type-check (tsc --noEmit) and bundle to dist/
npm run preview    # Preview the production bundle locally
```
> **Windows PowerShell tip:** Use `npm.cmd` (e.g., `npm.cmd run build`) if script execution policy blocks `npm.ps1`.

### Architecture & Code Guidelines
- **`src/config/`** — Pure static data catalogs (44 stores, 264 items, 11 area pools, 55 events, 53 bank rewards, 10 stage maps, avatar specs, walk sound metadata).
- **`src/engine/`** — Pure, deterministic, **DOM-free** state machine (`applyAction(state, action)`). Must contain zero `window`/`document`/DOM references so state stays portable across PeerJS hosts or dedicated servers.
- **`src/net/`** — Host-authoritative PeerJS WebRTC transport, message/action validation, reconnect backoff, and session-scoped `AVATAR_SYNC`.
- **`src/ui/` & `src/main.ts`** — DOM/CSS Grid/SVG rendering, animations, Web Audio synthesis, image cropper, modals, and `localStorage` persistence.
- **Before opening a PR:** Keep individual modules concise (aim for under ~250 lines by splitting cleanly), preserve original US PS1 game spellings unless fixing verified bugs, and run `npm run build` cleanly with zero TypeScript errors.

### Deployment (GitHub Pages)
`.github/workflows/deploy.yml` builds `dist/` (with `base: './'` in `vite.config.ts`) on **Node 22** when manually triggered via **Actions → Deploy Static Site to GitHub Pages** (`workflow_dispatch`).

---

## Credits & Acknowledgements

- **Original Game:** ***Board Game: Top Shop*** (***Tenant Wars***), developed by **KID** and published in North America by **A1 Games** (`SLUS-013.33`). All original game concepts, names, and designs belong to their respective owners.
- **Dreen:** Author of the [*Board Game: Top Shop* FAQ/Guide on GameFAQs](https://gamefaqs.gamespot.com/ps/20257-board-game-top-shop/faqs), which served as an essential early reference for original US store/item names, prices, events, and Bank rewards.
- **Christopher Childress (`satelliteoflove`):** Creator of [`satelliteoflove/topshop-english-fix`](https://github.com/satelliteoflove/topshop-english-fix), whose engine notes and disassembly documentation were invaluable for verifying event reachability, sale percentages, shop pricing mechanics, and clarifying misleading English strings in the original US localization.
