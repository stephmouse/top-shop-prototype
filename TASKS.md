# Top Shop Prototype — Future Development Tasks

A consolidated, scannable task list of remaining future/optional work pulled from `neon-bug-analysis` and `ROADMAP.md`.

> **Current Baseline (Done):** All 10 PS1 stages & verified `SLUS_013.33` rules, Bugs `#1`–`#16`, P2P Multiplayer (`Slices A–D`), 2D CSS/SVG Visual Polish (`Visual Slices 1–4`), custom standees & photo cropper, custom Walk Shoes, and the automated Vitest test suite (`npm test`) are complete.

---

## 1. Multiplayer Scaling & Networking *(from `neon-bug-analysis`)*

- [x] **Incremental `AVATAR_PUT` Portrait Sync** (`src/net/avatarSync.ts`, `src/net/protocol.ts`, `src/net/session.ts`, `src/ui/imageCropper.ts`)
  - Replaced full-map `AVATAR_SYNC` broadcasts with incremental `{ type: 'AVATAR_PUT', key, dataUrl }` updates/deletes (and per-entry initial sync on join) plus a `12 KB` portrait target in `imageCropper.ts` to stay well inside WebRTC SCTP safe single-message limits across browsers.
- [ ] **TURN Relay & Optional Relay-Only IP Privacy (`Phase 3B`)** (`src/net/avatarSync.ts`, `ROADMAP.md`)
  - Replace STUN-only `PEER_ICE_CONFIG` with an ephemeral TURN-credential endpoint (e.g., Cloudflare Worker + Cloudflare Calls TURN, or Metered.ca) and optional `iceTransportPolicy: 'relay'` mode so friends on 4G/5G CGNAT or strict Wi-Fi can connect reliably without hitting the 15-second timeout. Deferred until after initial friend playtesting; see `ROADMAP.md`.
- [ ] *(Optional / Low Priority)* **Pencil Roll Trust Hardening** (`src/engine/movementLanding.ts`)
  - Currently `handleRollPencil` trusts `chosenFace` sent by Guests so the 3D skill-stop stays snappy. Intentional UX trade-off for private friend lobbies—only worth hardening if untrusted players ever connect.

---

## 2. Gameplay Features *(from `ROADMAP.md`)*

- [ ] **AI Bot Players** (`src/engine/bot.ts`)
  - Build a heuristic bot controller that chooses routes toward unowned/own stores, opens and restocks shops, buys/buys out rival stores, and redeems Bank points for solo play or filling empty seats.

---

## 3. Tier 3 — Full 2D Mall Visuals & Animation *(from `ROADMAP.md`)*

Replace the placeholder CSS Grid board with a hybrid 2D WebGL canvas (`PixiJS`) while keeping menus and modals in HTML/CSS:

- [ ] **PixiJS Board Renderer:** Move the mall cross-section rendering onto a 2D WebGL (`PixiJS`) canvas while preserving existing HTML/CSS menus, HUD, and modals.
- [ ] **Physical Escalator & Hallway Token Paths:** Animate player tokens so they physically follow escalator steps/rails up and down on screen (including multi-floor express towers on Stages 7 & 10 and crossover hallways on Stages 2, 5 & 6) instead of the placeholder tile-to-tile glide.
- [ ] **Animated Mall Props:** Add scrolling escalator treads, moving elevator cars between floors, and walking customers/cashiers inside open stores.
- [ ] **Character & Item Art:** Add character reaction portraits on Events and Bank visits, plus illustrated icons across all 264 store items.
- [ ] **Camera Zoom & Pan:** Add smooth camera zoom and pan controls for larger mall layouts (`16×4` and `11×5` stages).
