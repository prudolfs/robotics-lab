# HUD — Right Panel & Detachable Widgets

> Implementation plan for grouping the existing scattered HUD widgets into a single
> tabbed right panel that can detach widgets onto the main viewport.
>
> References:
> - `docs/simulator.md` — architecture & milestone context (React observes, the loop owns)
> - `.temp/right-panel/robotics_lab_workspace_v9_integrated_camera_utils_tab/code.html` — the target **5-tab, 4-visible + scroll** layout (sensors / map / nav / teleop / utils)
> - `.temp/right-panel/robotics_lab_map_tab_state_refined/code.html` — fill-state version showing **per-widget drag handles** (`drag_indicator` icon before each widget title)
> - `.temp/right-panel/drag-and-drop/code.html` — the **drag-out / drop-grid / pop-out widget** interaction model (duplicates widget on the viewport, keeps it in the panel)
> - `.temp/right-panel/cyber_kinetic_terminal/DESIGN.md` — design tokens (glassmorphism, neon-cyan, JetBrains Mono data, Inter labels)

---

## Goals

1. Replace the scattered HUDs (`SensorHud`, `MapHud`, `NavigationHud`, `TeleopHud`, `LocalizationHud`, `DebugOverlay`, floating camera viewport, floating minimap) with **one** right panel.
2. The right panel has **5 tabs**: `Sensors`, `Map`, `Nav`, `Teleop`, `Utils`.
3. **4 tabs are visible** in the tab strip; the **5th is reachable by horizontal scroll** of the strip.
4. The whole panel has a **show/hide toggle** (chevron on the panel's leading edge).
5. Every widget has a **drag handle** before its title. Dragging a handle **out** of the panel duplicates that widget onto the main viewport and shows a **grid overlay** on the viewport indicating valid drop cells.
6. A popped-out widget shows a **remove button** to take it off the viewport. The widget **stays in the right panel** (duplication, not move) — simpler state, no empty slots.
7. Keep all controls and text **as close as possible** to what exists today; the reference HTMLs are design inspiration, not a literal restyle of every token (current app uses shadcn tokens; the references use the Cyber-Kinetic palette — we adapt the *structure*, not the *color system*).

## Non Goals

- Re-skinning the whole app to the Cyber-Kinetic palette / JetBrains-Mono-everywhere. (A later theme pass can do that; this work reuses existing shadcn `Button`, `border`, `bg-card/80`, `backdrop-blur-sm` surfaces.)
- Widget layout persistence across reloads (out for now; can be a follow-up).
- Redocking a popped-out widget back into a custom order in the panel.
- Touch/pen drag support in v1 — pointer (mouse) only, matching the reference.

---

## Current state inventory

Where the widgets live today (`apps/simulator/src/App.tsx` + `components/`):

| Widget today | File | Placement in `App.tsx` | Target tab |
|---|---|---|---|
| Lidar controls + camera toggle | `sensor-hud.tsx` (`SensorHud`) | right sidebar, top | **Sensors** |
| Robot camera viewport | `App.tsx` inline `<RobotCameraViewport>` | fixed center-bottom overlay | **Sensors** (toggle + the viewport itself stays a floating canvas element, owned by the Sensors widgets/panel) |
| Occupancy controls + stats + Clear map | `map-hud.tsx` (`MapHud`) | right sidebar, middle | **Map** |
| Occupancy minimap | `App.tsx` inline `<OccupancyMinimap>` | left-center floating | **Map** |
| Navigation (goals, autonomy, coverage, planner, path) | `navigation-hud.tsx` (`NavigationHud`) | center-bottom overlay | **Nav** |
| Localization (odometry estimate vs truth, drift, trail) | `localization-hud.tsx` (`LocalizationHud`) | bottom-right overlay | **Nav** |
| Teleop (key hints, throttle, wheel cmds, ESTOP) | `teleop-hud.tsx` (`TeleopHud`) | right sidebar, bottom | **Teleop** |
| Robot debug (pose, heading, speed, turn rate, wheels) | `debug-overlay.tsx` (`DebugOverlay`) | bottom-left overlay | **Utils** |

> The reference `Utils` tab also shows a **System Logs** panel. We do not have a log stream today; Phase 5 adds a lightweight one (or stubs it) to fill the tab — bonus, not a blocker.

---

## State model (new Zustand slice)

Add a `panel` slice to `apps/simulator/src/store.ts` (pure UI state — no sim ownership changes):

```ts
type WidgetId =
  | 'sensors.lidar' | 'sensors.camera'
  | 'map.controls' | 'map.minimap'
  | 'nav.navigation' | 'nav.localization'
  | 'teleop.controls'
  | 'utils.robotDebug' | 'utils.logs'

type PoppedWidget = {
  id: WidgetId            // unique instance id (allows duplicates later)
  widget: WidgetId        // which widget kind
  gridX: number            // drop-grid column
  gridY: number            // drop-grid row
  // viewport pixel pos derived from grid cell at render time
}

type PanelState = {
  open: boolean            // panel show/hide
  activeTab: 'sensors' | 'map' | 'nav' | 'teleop' | 'utils'
  popped: PoppedWidget[]   // widgets rendered on the main viewport
  // actions
  togglePanel: () => void
  setTab: (tab) => void
  popWidget: (widget: WidgetId, gridX: number, gridY: number) => void
  removePopped: (id: string) => void
  movePopped: (id: string, gridX: number, gridY: number) => void // drag within viewport
}
```

Rationale for grid coordinates instead of raw pixels: the reference snaps on drop and re-snaps on internal drag; storing grid cells keeps it resolution-independent and trivial to render the drop grid (a 4×4 lattice over the viewport, matching `drag-and-drop/code.html`).

---

## Implementation phases

### Phase 1 — Right panel shell + tab strip (no widgets yet)

**Files:**
- `apps/simulator/src/components/right-panel.tsx` (new) — `<RightPanel>` shell.
- `apps/simulator/src/store.ts` — add `panel` slice (`open`, `activeTab`, `togglePanel`, `setTab`, empty `popped`).
- `apps/simulator/src/App.tsx` — mount `<RightPanel>` and **stop** rendering the old scattered HUDs into the right sidebar (but keep the floating canvas overlays — camera viewport, minimap — for now so the sim still works; they get relocated in later phases).

**Behavior:**
- Fixed right sidebar, ~320px, `top-12 bottom-8` (leave room for a future top app bar / footer from the reference; for now `top-4 bottom-4`). `bg-card/80 backdrop-blur` border-l.
- **Show/hide toggle**: a chevron button on the panel's leading edge; toggling sets `panel.open` and the panel translates off-screen (`translate-x-full`) with a transition. Port `togglePanel()` from both reference HTMLs.
- **Tab strip**: horizontal, `overflow-x-auto` + the `no-scrollbar` trick (ported CSS from the references) + `snap-x snap-mandatory`. Each tab is `flex-none w-1/4` so **4 fit** and the **5th overflows** and is reached by scrolling. Active tab gets `border-b-2 border-primary text-primary`; selecting also `scrollIntoView({inline:'center'})` (from `script` in the references).
- Tabs: `Sensors` (icon `sensors`), `Map` (`map`), `Nav` (`explore`), `Teleop` (`joystick`), `Utils` (`build`). Use `lucide-react` icons (already a dep) — `Radar`/`ScanLine`, `Map`, `Compass`, `Joystick`/`Gamepad2`, `Wrench` — instead of Material Symbols (not installed).

**Exit criteria:** panel shows, toggles, the 5 tabs switch an empty content area; 4 visible, 5th scrolls in. Existing tests still green (we haven't removed the old components' exports yet, only stopped mounting them in the right sidebar).

### Phase 2 — Port existing widgets into tabs (no drag yet)

**Goal:** every existing control surface lives inside a tab; remove the old floating placements from `App.tsx`.

**Files:**
- `apps/simulator/src/components/widgets/` (new folder) — one file per widget, each a thin wrapper around the *current* HUD component so we keep all text/labels/sliders byte-for-byte:
  - `lidar-widget.tsx` → wraps the sliders/toggles from `SensorHud` (lidar section).
  - `camera-widget.tsx` → the camera toggle + noise control; the **camera viewport canvas** stays in `App.tsx` (it must live outside `<Canvas>`), but its toggle moves here. (See "camera viewport" note below.)
  - `map-controls-widget.tsx` → wraps `MapHud` body.
  - `minimap-widget.tsx` → owns the minimap toggle; the `<OccupancyMinimap>` canvas stays in `App.tsx` like the camera.
  - `navigation-widget.tsx` → wraps `NavigationHud` body.
  - `localization-widget.tsx` → wraps `LocalizationHud` body.
  - `teleop-widget.tsx` → wraps `TeleopHud` body.
  - `robot-debug-widget.tsx` → wraps `DebugOverlay` body.
- `apps/simulator/src/components/widgets/widget-card.tsx` (new) — shared frame: header row with **drag handle placeholder** (a `GripVertical` lucide icon, non-interactive in Phase 2), title (the existing widget's header text), and the optional status chip. Children slot = the existing widget body. This is the single styled unit reused in-panel and on the viewport.
- `apps/simulator/src/components/right-panel.tsx` — render the 5 tab content panes, each composing the relevant `WidgetCard`s vertically with the existing gap spacing.
- `apps/simulator/src/App.tsx` — delete the right-sidebar stack of `SensorHud`/`MapHud`/`TeleopHud`, the absolutely-placed `NavigationHud` and `LocalizationHud`, and the bottom-left `DebugOverlay`. Keep `<RightPanel>`, the floating camera viewport, and the floating minimap for now.

**Design notes (keep close to today):**
- `Camera widget` → goes in **Sensors tab** (per requirement). Keep `"Sensors"` header, `"Lidar"`/`"Cam"` toggle buttons, range/resolution/FOV/noise/dropouts sliders, `"Camera noise"` cycle button exactly as in `SensorHud`. The reference also shows a live preview thumbnail; we do **not** have a thumbnail render separate from the viewport, so the Sensors camera widget keeps the toggle + "drag the camera pane to look up/down" hint from today.
- `Minimap` → **Map tab**. Today `MapHud` has `Grid` + `Mini` toggles and stats and `Clear map`. Split per requirement: the **minimap** widget owns `showMinimap` toggle + the minimap canvas; the **map controls** widget owns `showOccupancy` toggle, the free/occupied/unknown % stats, and `Clear map`. (Both live in the Map tab; the requirement only says "minimap into map tab", which holds.)
- `Navigation` + `Localization` → **Nav tab**. Wrap both existing components unchanged. Today `LocalizationHud` is absolutely positioned `right-72 bottom-4`; that positioning is dropped — it becomes a normal flow card in the Nav tab.
- `Robot debug` → **Utils tab**. Wrap `DebugOverlay`'s body (pose/heading/speed/turn rate/wheels + Reset). The reference Utils tab also has a **System Logs** box; add a `logs-widget.tsx` that renders a small scrollable list fed from a tiny logger — **optional/stub** (see Phase 5). Not required for the core requirement.
- `Teleop` → **Teleop tab**. Wrap `TeleopHud` body verbatim.

**Camera/minimap canvas caveat:** `RobotCameraViewport` and `OccupancyMinimap` are DOM elements that must sit outside `<Canvas>` and float over the viewport. Their *toggle* and *config* live in the panel widgets, but the *rendered element* continues to be mounted by `App.tsx` gated on `showCamera`/`showMinimap`. This matches today and avoids making the panel own R3F-adjacent elements. (A popped-out "camera widget" on the viewport would just be the controls, not a second live camera — duplicating a live WebGL viewport per panel instance is out of scope.)

**Exit criteria:** all controls reachable from the right panel; the app no longer renders the old scattered overlay placements except the two canvas floats; `typecheck` + unit + e2e tests updated (see Phase 6) and green.

### Phase 3 — Drag handle + drop grid + pop-out duplication

**Goal:** dragging a widget handle out of the panel drops a **duplicate** onto the viewport and shows the grid overlay; the panel copy stays.

**Files:**
- `apps/simulator/src/components/widgets/widget-card.tsx` — make the `GripVertical` handle a real drag source using **HTML5 drag-and-drop** (`draggable`, `onDragStart`), mirroring `drag-and-drop/code.html`'s `handleDragStart`:
  - on dragstart: set a module-level `draggedWidgetId`, add `drag-overlay-active` class to `<body>`, show `#drag-grid`, and synthesize a translucent ghost drag image (clone the card, apply `widget-ghost` styling, `setDragImage`).
- `apps/simulator/src/components/drop-grid.tsx` (new) — the 4×4 lattice overlay over `#simulation-viewport`, `pointer-events-none` until `active`, dashed `border-primary/30` cells; the cell under the cursor highlights (`border-primary/60` + glow). CSS ported from the reference `style` block + the `.drop-grid` rules.
- `apps/simulator/src/components/viewport-widgets-layer.tsx` (new) — an `absolute inset-0 pointer-events-none` layer over the viewport that renders the `popped[]` array; each popped widget child is `pointer-events-auto`.
- `apps/simulator/src/App.tsx` — add overlay classes/containers: the `drag-overlay-active` class dims/blurs the sim image (`filter: brightness(0.3) blur(4px)` from the reference), mount `<DropGrid>` + `<ViewportWidgetsLayer>` inside `#simulation-viewport`. The viewport already exists in the reference as `#simulation-viewport`; reuse the same id.
- `apps/simulator/src/store.ts` — wire `popWidget(widget, gridX, gridY)` (called from the viewport's `onDrop`), `removePopped(id)`, and the `dragend` cleanup (clear `drag-overlay-active`, hide grid).

**Drop logic** (ported from the reference `viewport.addEventListener('drop')`):
- compute grid cell from `e.clientX/clientY` vs viewport rect and `/cellW`, `/cellH`.
- call `popWidget(widgetId, gridX, gridY)`.
- **panel copy is untouched** — duplication, per requirement ("keep it in right panel to make things simple").

**Popped widget rendering** (ported from `popOutWidget()`):
- a `WidgetCard` with an extra header: the existing drag handle (for repositioning inside the viewport), the widget title, and a **remove button** (`lucide` `X` or `LogOut` → reference uses `logout`). Clicking remove calls `removePopped(id)`.
- internal drag repositioning via pointer-events on the handle, snapping to the 4×4 grid on release (ported `mousedown`/`mousemove`/`mouseup` logic, grid-snap math).

**Exit criteria:** drag a Sensors/Map/Nav/Teleop/Utils widget handle out → grid appears, drop → duplicate floats on the viewport at the snapped cell, panel copy remains; remove button clears the popped copy; dragging the popped copy's handle moves + re-snaps it.

### Phase 4 — Interactions polish & a11y

- Keyboard: each tab button `role="tab"` + `aria-selected`; the strip is `role="tablist"`; arrow Left/Right moves between tabs (wraps). The 5th tab is still scrolled-to on focus.
- The panel collapse toggle is a real `<button>` with `aria-expanded`/`aria-controls` and a visible focus ring (today's overlays are decorative-only).
- Drag handle has `aria-label="Drag {widget} out of panel"` and a `cursor-grab`/`active:cursor-grabbing`.
- Popped widget remove button has `aria-label="Remove {widget} from viewport"`.
- `prefers-reduced-motion`: disable the panel slide transition and the drop-grid fade.
- Drop grid cells announce themselves subtly; the dim/blur on `drag-overlay-active` is reduced under reduced-motion.

**Exit criteria:** keyboard-only user can switch tabs, collapse/expand the panel, and trigger the (mouse) pop-out flow's drop; screen-reader labels present; reduced-motion respected.

### Phase 5 — Utils tab content (logs) + polish gaps

- `logs-widget.tsx`: a small ring buffer logger. Two cheap options:
  1. **Minimal:** subscribe to `console` via a tiny `useLogger` hook that captures `console.info/warn/error` lines (dev only) into a capped array, render in a `font-mono` scroll box like the reference.
  2. **Defer:** ship the widget as "No logs yet" and wire it in a later milestone.
  Pick (1) only if it stays <60 lines and doesn't change loop ownership.
- Reconcile any double-rendering: ensure `SensorHud`/`MapHud`/`TeleopHud`/`NavigationHud`/`LocalizationHud`/`DebugOverlay` files are either (a) kept as the *bodies* the widgets wrap, or (b) inlined into the widget files and the old files deleted. Prefer (b) to avoid a confusing indirection layer — but only after the wrapped versions are confirmed green in Phase 2. (Decision encoded as a Phase 5 cleanup task.)
- Remove dead imports/exports from `App.tsx` and unexport anything that's now panel-internal.

**Exit criteria:** Utils tab has robot debug + logs; no leftover dead code; `pnpm typecheck` clean.

### Phase 6 — Tests

- **Unit (vitest):** `store` panel slice — `togglePanel`, `setTab`, `popWidget` adds to `popped` with correct grid coords + leaves panel copy logically present, `removePopped` removes one by id, `movePopped` updates coords. Grid-clamp helpers (drop coords out of range are clamped to `[0,3]`).
- **E2E (playwright):**
  - `right-panel.spec.ts` — panel visible by default; collapse toggle hides it; each of the 5 tabs is selectable; the 5th tab requires horizontal scroll to become visible (assert it's off-strip until scrolled).
  - `widgets-drag.spec.ts` — drag the Lidar widget handle out of the panel → assert a popped widget appears on the viewport, the panel copy still present, drop grid visible during drag, remove button dismisses the popped widget. (Use `page.mouse` for the native DnD; the reference is mouse-based.)
  - Update `smoke.spec.ts`/`sensors.spec.ts`/`navigation.spec.ts`/`teleoperation.spec.ts`/`localization.spec.ts`/`occupancy-grid.spec.ts` selectors that today target the scattered overlays (e.g. `nav-status`, `estop-button`, `lidar-toggle`, `clear-map-button`, `robot-pose`, `odometry-pose`) so they target the same controls now living inside the right panel tabs. Keep the `data-testid` attributes identical on the underlying controls to minimize churn.
- **Visual/parity:** quick manual pass: every slider label, value format (`fmt`/`deg`), button text, and toggle wording matches today's strings.

**Exit criteria:** all unit + e2e green; `pnpm typecheck` + `pnpm build` clean.

---

## Open questions (decide before Phase 3)

1. **Drop grid resolution:** reference uses 4×4 in `drag-and-drop/code.html` (and a 3×2 in the inline demo). Propose **4×4** for both the overlay and the snap lattice; revisit if popped widgets overlap on small viewports.
2. **Duplicate ids:** if a user drops the *same* widget kind twice, two popped instances share a `widget` id. Use a per-instance `id` (`crypto.randomUUID()` or a counter) for `removePopped`/`movePopped` keys — already in the `PoppedWidget` type above.
3. **Camera/minimap as popped widgets:** since the live WebGL viewports are singletons mounted by `App.tsx`, a popped "camera widget" on the viewport would be controls-only (no second live feed). Confirm acceptable (assumed yes — requirement says "duplicate widget", not "duplicate live render"). Map this explicitly in Phase 3 docs.
4. **Top app bar / footer status bar:** the references include a 48px top bar (title, map-type toggle, play/reset/estop) and a 32px footer (sim time / fps / status). Today these controls are scattered (top-left HUD + top-center buttons). Out of scope for this plan; a future "app shell" task can fold them in. The panel's `top`/`bottom` insets in Phase 1 leave room for them.
