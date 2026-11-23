# Top Shop Prototype — Workspace Rules

## Environment & Commands (Windows PowerShell)
- Always use `npm.cmd` instead of `npm` (PowerShell script execution policy blocks `npm.ps1`).
- Automated tests: `npm.cmd test` (`vitest run`).
- Type-check & build: `npm.cmd run build` (`tsc --noEmit && vite build`).
- Always run `npm.cmd test` and `npm.cmd run build` after edits and fix any test or TypeScript errors before finishing.

## Architecture & Code Discipline
- **Strict Separation of Concerns:**
  - `src/config/`: All tunable numbers, store/item catalogs, event cards, bank rewards, and map layouts.
  - `src/engine/`: Pure, deterministic, action-driven state machine (`applyAction(state, action)`). **Zero DOM/browser references** so it can later run in a WebRTC host or server.
  - `src/ui/` & `src/main.ts`: DOM/CSS Grid/SVG rendering and input handling only.
- **File Size:** Keep individual files concise (under ~250 lines) by splitting cleanly.
- **Placeholder Visuals:** Use CSS Grid, color-coding, and SVG overlays rather than external art assets or heavy frameworks.

## Locked-In Game Rules (Do Not Break)
- **Original US Names:** Preserve original US spellings in `src/config/storesPart1.ts`, `storesPart2.ts`, and `events.ts` (e.g., `Fruits Market`, `Mash Potato`, `Go-Carts`, `Final Sale`). Do not overwrite `// VERIFY` markers without asking.
- **Pencil Die:** 9 faces (`1`–`8` and `E` for Event).
- **Movement & Escalators:**
  - `horizontalDir` and `verticalDir` lock independently and unlock (`null`) on Bank landing, Elevator stop, or specific Events.
  - Players physically step onto escalator tiles (`ESCALATOR_RIDE`, `ESCALATOR_UNDO`) and auto-slide off after 210ms (0 extra steps consumed) unless paused at an unlocked `X` fork (`CHOOSE_DIRECTION`).
  - `moveHistory` supports 1-step undo (`UNDO_STEP` / opposite arrow key) and full reset (`CANCEL_MOVE` / `Esc`). Passing Bank or committing any shop/bank/event action clears `moveHistory` to prevent exploits.
- **Shops & Chains:**
  - Each shop tile has its own `Shop` record and inventory (`stock`). Adjacent same-owner tiles in the same segment form a chain (L1–L4), upgrading capacities (`[3, 4, 5, 6]`) and item tier unlocks across the chain.
  - Newly opened/bought-out tiles auto-stock with the cheapest `capacity` items; existing chain tiles keep their current stock.
  - Only 1 player may own a given store type per segment.
- **Bank:** 1 action per Bank visit (`BANK_MENU` exits immediately after redeeming a reward).