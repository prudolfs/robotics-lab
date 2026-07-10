# HUD — Right Panel & Detachable Widgets

> Implementation plan for grouping the existing scattered HUD widgets into a single
> tabbed right panel that can detach widgets onto the main viewport.
>
> References:
> - `docs/simulator.md` — architecture & milestone context (React observes, the loop owns)
> - `.temp/right-panel/robotics_lab_workspace_v9_integrated_camera_utils_tab/code.html` — the target **5-tab, 4-visible + scroll** layout (sensors / map / nav / teleop / utils)
> - `.temp/right-panel/robotics_lab_map_tab_state_refined/code.html` — fill-state version showing **per-widget drag handles** (`drag_indicator` icon before each widget title)
> - `.temp/right-panel/drag-and-drop/code.html` — the **drag-out / drop-grid / pop-out widget** interaction model (inspiration only — we move widgets onto viewport **edges** with dnd-kit rather than duplicating onto a centre grid)
> - `.temp/right-panel/cyber_kinetic_terminal/DESIGN.md` — design tokens (glassmorphism, neon-cyan, JetBrains Mono data, Inter labels)

---

## Goals

1. Replace the scattered HUDs (`SensorHud`, `MapHud`, `NavigationHud`, `TeleopHud`, `LocalizationHud`, `DebugOverlay`, floating camera viewport, floating minimap) with **one** right panel.
2. The right panel has **5 tabs**: `Sensors`, `Map`, `Nav`, `Teleop`, `Utils`.
3. **4 tabs are visible** in the tab strip; the **5th is reachable by horizontal scroll** of the strip.
4. The whole panel has a **show/hide toggle** (chevron on the panel's leading edge).
5. Every widget has a **drag handle** before its title. Dragging a handle **out** of the panel **closes the panel**, surfaces four **edge drop zones** (top/right/bottom/left) that bracket — never cover — the simulation viewport, and dropping on an edge **moves** the widget onto that edge. (The simulation centre is intentionally not a drop target; widgets never occlude the scene.) Drag is driven by **dnd-kit** (pointer events) rather than native HTML5 drag.
6. A popped-out widget shows a **close (X) button** instead of a drag handle (plus a small re-dock handle). Clicking close **moves the widget back to its tab** in the panel. The widget is **moved**, not duplicated — while a kind is popped its panel slot is hidden entirely (one live instance ever, including live feeds).
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
  | 'sensors.lidar' | 'sensors.camera.controls' | 'sensors.camera.feed'
  | 'map.controls' | 'map.minimap'
  | 'nav.navigation' | 'nav.localization'
  | 'teleop.controls'
  | 'utils.robotDebug' | 'utils.logs'

type DropEdge = 'top' | 'right' | 'bottom' | 'left'

// A widget is MOVED onto the viewport (not duplicated). The kind doubles as
// the instance id — a kind is popped at most once; re-dropping it moves it.
type PoppedWidget = {
  widget: WidgetId       // which widget kind (also the instance id)
  edge: DropEdge          // dock edge on the viewport
}

type PanelState = {
  open: boolean            // panel show/hide
  activeTab: 'sensors' | 'map' | 'nav' | 'teleop' | 'utils'
  popped: PoppedWidget[]   // widgets moved onto the main viewport
  draggingWidget: WidgetId | null  // kind being dragged / zones shown
  // actions
  togglePanel: () => void
  setTab: (tab) => void
  startDragWidget: (widget: WidgetId) => void        // closes panel, mounts zones
  dropPoppedWidget: (widget: WidgetId, edge: DropEdge) => void  // move onto edge
  cancelDragWidget: () => void                       // reopen, no pop
  undockWidget: (widget: WidgetId) => void           // close button → back to tab
}
```

Rationale for an `edge` (not pixels / a centre grid): the simulation centre must stay unoccluded, so widgets dock to one of four viewport edges. dnd-kit's pointer-based drag computes the active zone from the pointer position; storing `edge` keeps it resolution-independent and trivial to render the drop zone overlay.

---

## Implementation phases

### ✅ Phase 1 — Right panel shell + tab strip (no widgets yet)  **[DONE]**

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

**Phase 1 implementation notes (landed):**
- `panel` slice added to `apps/simulator/src/store.ts`: `panelOpen`, `activeTab` (`PanelTab` type: `sensors | map | nav | teleop | utils`), `togglePanel()`, `setTab(tab)`. Covered by `apps/simulator/src/store.test.ts`.
- `apps/simulator/src/components/right-panel.tsx`: the shell — fixed right-edge `aside`, a collapse toggle that slides the panel almost fully off-screen leaving the toggle poking out (`translate-x-[calc(100%-1rem-2rem)]` when closed), and a horizontally-scrollable tab strip (`no-scrollbar`, `snap-x snap-mandatory`, each tab `w-1/4` so **4 tabs fit** and the **5th scrolls in**; selecting a tab `scrollIntoView({inline:'center'})`).
- `.no-scrollbar` utility added to `apps/simulator/src/styles.css`.
- `apps/simulator/src/App.tsx` mounts `<RightPanel />`. **Temporary:** so the new panel can claim the right edge without overlapping the live legacy HUDs, the legacy right-sidebar stack (`SensorHud`/`MapHud`/`TeleopHud`) is docked to the **upper-left** (`top-32 left-4 max-h-[40vh]`) and `LocalizationHud` is shifted from `right-72` to `right-88` to clear the panel. These are throwaway Phase-1 placements; **Phase 2 deletes them** and folds the HUD bodies into the panel tabs (the `localization-hud.tsx` `right-88` tweak should be reverted/removed then).
- New e2e: `apps/simulator/e2e/right-panel.spec.ts` (panel visible/5 tabs, collapse+reopen, per-tab pane visibility, 5th-tab horizontal-scroll-into-view).
- Verified: `pnpm typecheck` clean, `pnpm test` 65/65, `pnpm test:e2e` 44/44.

### ✅ Phase 2 — Port existing widgets into tabs (no drag yet)  **[DONE]**

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

**Phase 2 implementation notes (landed):**
- New `apps/simulator/src/components/widgets/` folder with one file per widget, each composing a `WidgetCard` (the shared styled frame) with the existing HUD body. The widget bodies are inlined from the old HUD components rather than wrapping them as black boxes, because the old HUDs carried their own absolute positioning (`NavigationHud` `absolute bottom-4 left-1/2 -translate-x-1/2`, `LocalizationHud` `absolute right-88 bottom-4`, `DebugOverlay` `absolute bottom-4 left-4 pointer-events-none`) and card chrome (`border bg-card/80 p-3 backdrop-blur-sm`); both are now the `WidgetCard`'s job. All control text / labels / slider ranges / button wording / `data-testid`s are kept byte-for-byte from the originals.
  - `widget-card.tsx` — the shared card: header row with **drag handle placeholder** (a non-interactive `GripVertical` lucide icon carrying `data-testid="widget-drag-handle"`), the widget title, and an optional right-aligned status chip; children = the widget body. `pointer-events-auto` is on the card (Phase 3 makes the handle a real HTML5 drag source).
  - `lidar-widget.tsx` (Sensors) — `Lidar` toggle + range / resolution / FOV / noise / dropouts sliders, title "Sensors".
  - `camera-widget.tsx` (Sensors) — `Cam` on/off toggle + `Camera noise` cycle + the "drag the camera pane to look up / down" hint, title "Camera". Per the plan, the Sensors tab holds both the lidar and camera cards; the live `RobotCameraViewport` canvas stays mounted in `App.tsx` (outside `<Canvas>`), gated on `showCamera`.
  - `map-controls-widget.tsx` (Map) — `Grid` (`showOccupancy`) toggle + free/occupied/unknown % stats + `Clear map`, title "Map".
  - `minimap-widget.tsx` (Map) — `Mini` (`showMinimap`) toggle, title "Minimap"; the `OccupancyMinimap` canvas stays mounted in `App.tsx`, gated on `showMinimap`.
  - `navigation-widget.tsx` (Nav) — `Auto: ON/OFF`, `Clear goals`, coverage (`Clean Room` / `Stop`), planner (A*/Dijkstra), path overlay, active-goal / distance / queued / waypoints readouts, with the `nav-status` badge passed to `WidgetCard` as the status chip, title "Navigation".
  - `localization-widget.tsx` (Nav) — estimate vs truth, drift, trail guard + `Clear trail`; the Phase-1 `right-88` absolute positioning is dropped (it becomes a normal-flow card), title "Localization" (`data-testid="localization-hud"` preserved).
  - `teleop-widget.tsx` (Teleop) — key hints, throttle slider, command L/R + speed readouts, `ESTOP`, with the teleop status badge as the status chip, title "Teleop".
  - `robot-debug-widget.tsx` (Utils) — pose / heading / speed / turn rate / wheels + `Reset` (`data-testid="robot-debug"` + hidden `data-testid="robot-pose"` preserved), title "Robot debug".
  - `logs-widget.tsx` (Utils) — Phase-5-bait stub: a scrollable mono box rendering "No logs yet" (real ring-buffer logger deferred to Phase 5).
- `apps/simulator/src/components/right-panel.tsx` — renders the 5 tab content panes via a small `TabPane` helper (kept mounted, `hidden` when inactive) stacking the relevant `WidgetCard`s with `gap-3`. `RightPanel` now takes `controls: SimulationControls` + `onReset` props (threaded from `App.tsx` → the Nav / Teleop / robot-debug widgets) so the loop remains the single owner of sim state. It also subscribes to `robot` so the Utils-tab debug widget re-renders each frame like the old `DebugOverlay` did.
- `apps/simulator/src/App.tsx` — deleted the Phase-1 upper-left legacy stack (`SensorHud`/`MapHud`/`TeleopHud`), the absolutely-placed `NavigationHud` and `LocalizationHud`, and the bottom-left `DebugOverlay`. Kept `<RightPanel controls={controls} onReset={controls.reset} />`, the top-left HUD readouts, the top-center Pause/Reset/map buttons, and the two live canvas floats (`RobotCameraViewport` + `OccupancyMinimap`).
- The old HUD component files (`sensor-hud.tsx`, `map-hud.tsx`, `navigation-hud.tsx`, `teleop-hud.tsx`, `localization-hud.tsx`, `debug-overlay.tsx`) are now **dead** (no longer imported in `src/` or `e2e/`). They are intentionally left in place for Phase 5 to delete as part of the inline-vs-wrap reconciliation noted there.
- E2E tests updated per the Phase-6 guidance: an `activateTab(page, tab)` helper was added to `e2e/fixtures.ts`, and tests that click controls now in non-default tabs switch to that tab first (`smoke` → Utils for `robot-debug`; `teleoperation` → Teleop for `estop-button`; `navigation` → Nav for `clear-goals-button`; `localization` → Nav for the localization controls / Utils for `resetWorld`; `occupancy-grid` → Map for `minimap`/`occupancy-grid` toggles; `console` → Utils + `Map`). All `data-testid`s on the underlying controls were kept identical, minimizing selector churn.
- Verified: `pnpm typecheck` clean, `pnpm test` 65/65, `pnpm test:e2e` 44/44, `pnpm build` clean, `pnpm lint` / `pnpm check` clean.

### ✅ Phase 3 — Drag handle + edge drop zones + pop-out (move, not duplicate)  **[DONE]***

**Goal:** dragging a widget handle out of the panel **closes the panel**, surfaces four **edge drop zones** (top/right/bottom/left) around — never on top of — the simulation viewport, and dropping on a zone **moves** the widget onto that edge. The widget is not duplicated: while a kind is popped its panel slot is hidden entirely (no empty placeholder) and the lone rendered copy owns its body — including any live feed (camera/minimap). The popped copy shows a **close (X) button** instead of a drag handle; clicking it moves the widget back to its tab.

Also folds the scattered top-left HUD + top-centre button cluster into a **top app bar** (h-12) and a **footer status bar** (h-8); panel insets become `top-12 bottom-8`.

**Files:**
- `apps/simulator/src/store.ts` — `panel.popped` (now `{ widget, edge }` — no per-instance `id`, since a kind is a singleton) + `draggingWidget` + `startDragWidget` / `dropPoppedWidget` / `cancelDragWidget` / **`undockWidget`** (replaces the old `removePopped(id)`) + `isWidgetPopped` selector. Dropping stores an `edge: DropEdge` (not pixels/grid cells); re-dropping the same kind moves its existing copy to the new edge.
- `apps/simulator/src/components/dnd-context.tsx` (new) — a `DndProvider` wrapping the panel + overlays using `@dnd-kit/core`. A `PointerSensor` (8px activation threshold) drives the drag; on `dragStart` it records the active kind + mode ('pop' vs 'redock') and calls `startDragWidget` (closes the panel + mounts the zones). On `dragEnd` it reads `over.data.current.edge` and calls `dropPoppedWidget(widget, edge)` or `cancelDragWidget()`. A `DragOverlay` renders a tiny ghost card that follows the pointer. Helpers `useWidgetDragHandle(widget, mode)` and `useEdgeDropZone(edge)` are exported for the handle/zone elements. **Why dnd-kit:** the previous native HTML5 `draggable` + `onDragStart`/`onDrop` flow was not firing reliably in the browser and was un-drivable by Playwright (synthetic `DragEvent` dispatch doesn't run a real gesture). dnd-kit uses pointer events, so a real mouse works and Playwright's `page.mouse` can drive it.
- `apps/simulator/src/components/widgets/widget-card.tsx` — the `GripVertical` handle becomes a **dnd-kit drag source** via `useWidgetDragHandle(widget, 'pop')`; spreading `dragHandleProps` attaches the pointer listeners. In panel mode, when the kind is already popped the card renders `hidden` (move, not duplicate — the panel slot is empty while the widget lives on the viewport). In `PoppedContext` it renders body-only (the popped wrapper owns the title + close button + re-dock handle).
- `apps/simulator/src/components/drop-zones.tsx` (new) — a `pointer-events-auto` overlay shown only while `draggingWidget` is set. Four edge bands (top/right/bottom/left) bracket the viewport — **the simulation centre is not a drop target**. Each is a dnd-kit `useDroppable` (`useEdgeDropZone`); the one under the pointer highlights (`data-over`, primary glow). The sim canvas behind is dimmed while active.
- `apps/simulator/src/components/viewport-widgets-layer.tsx` (new) — a `pointer-events-none` layer rendering the `popped[]` array, hidden while dragging. Each copy is `pointer-events-auto`, docked to its `edge` (clear of the app bars), and renders the widget body via the shared `renderWidget` registry wrapped in `PoppedContextProvider` (body-only). Its header carries a small **re-dock drag handle** (`useWidgetDragHandle(widget, 'redock')`) and a **close (X) button** (`undockWidget(widget)` → moves the widget back to its tab).
- `apps/simulator/src/components/widgets/camera-feed-widget.tsx` — the live `RobotCameraViewport` moves **into** this widget (it no longer lives in `App.tsx`). With the move model there is ever one rendered copy; it owns the single live canvas whether docked-in-panel or popped.
- `apps/simulator/src/components/widgets/minimap-widget.tsx` — same: the live `OccupancyMinimap` moves into this widget and owns the single live canvas.
- `apps/simulator/src/components/widgets/widget-registry.tsx` — `renderWidget(widget, props)` is the single place that maps a `WidgetId` to its body, so the panel panes and the viewport layer never drift apart. (`dockedOnViewport?` is kept on the interface for symmetry but unused under the move model.)
- `apps/simulator/src/App.tsx` — mounts `<TopAppBar>` + `<FooterStatusBar>`, wraps the panel + `<DropZones>` + `<ViewportWidgetsLayer>` in `<DndProvider>`, moves the panel to `top-12 bottom-8`, and removes the old unconditional `RobotCameraViewport` / `OccupancyMinimap` floats (they live in the widgets now).

**Drop logic** (edge zones, not a centre grid):
- on `dragStart` of a panel handle (mode 'pop'): `startDragWidget(widget)` → `panelOpen=false`, `draggingWidget=widget`, zones appear.
- the viewport is bracketed by 4 edge bands (top/right/bottom/left) — each is a dnd-kit droppable; the centre (the simulation view) is **not** a drop target and is covered by a dim backdrop + a "drop on a viewport edge to dock" hint.
- on `drop` over an edge: `dropPoppedWidget(widget, edge)` moves the widget to that edge (singleton — a kind is popped at most once; re-dropping moves it). If `over` is null (released over the centre / outside the window / cancelled by Esc) → `cancelDragWidget()`. Either way the drag collapses and the panel reopens.

**Popped widget rendering:**
- a card docked to its edge (clear of the app bars), header row with a small **re-dock drag handle** (dnd-kit mode 'redock' — re-triggers the edge-zone flow to move it to another edge), the title, and a **close (X) button**. Clicking the close button calls `undockWidget(widget)` and **moves the widget back to its tab** (panel card un-hides).
- a widget kind is in exactly one place at a time: while popped, the panel card renders `hidden` (no empty placeholder, no duplicate). Live-feed kinds (`sensors.camera.feed`, `map.minimap`) render their live canvas wherever that one copy lives.

**Exit criteria:** drag a Sensors/Map/Nav/Teleop/Utils widget handle out → panel slides closed, edge zones appear; drop on an edge → widget moves onto that edge and the panel slot hides; click the popped copy's close button → it moves back to its tab and its panel card reappears; drag the popped copy's handle to drop on another edge → it re-docks there (never duplicated). Existing `data-testid`s preserved; top app bar + footer render and stay green.

**Phase 3 implementation notes (landed):**
- `@dnd-kit/core` + `@dnd-kit/utilities` added. `DndProvider` (`components/dnd-context.tsx`) owns the `DndContext`, a `PointerSensor` (8px activation so a click doesn't start a drag), and a `DragOverlay` ghost. `useWidgetDragHandle(widget, mode)` returns `{ dragHandleProps, isDragging }`; `useEdgeDropZone(edge)` returns `{ dropZoneProps, isOver }`.
- `store.ts`: `PoppedWidget` is now `{ widget, edge }` (no `id` — the kind doubles as the instance id). `mergePopped` replaces-in-place on the same `widget`. New action `undockWidget(widget)` removes the kind from `popped` and reopens the panel; the old `removePopped(id)` + `newPoppedId()` are gone. `isWidgetPopped` is unchanged.
- `widget-card.tsx`: panel mode hides the card entirely (`hidden`) while its kind is popped (move, not duplicate). The handle spreads `dragHandleProps` (dnd-kit listeners) and carries `data-testid="widget-drag-handle"` + `data-widget`.
- `drop-zones.tsx`: four `useEdgeDropZone` bands (`drop-zone-${edge}` with `data-over` when active) bracketing the viewport; sim view dimmed behind; centre carries the hint and is not droppable.
- `viewport-widgets-layer.tsx` (mode 'redock' handle + `data-testid="popped-remove-${widget}"` close button → `undockWidget(widget)`). `data-testid="popped-widget-${widget}"` + `data-edge` preserved for the e2e suite.
- `camera-feed-widget.tsx` / `minimap-widget.tsx` now **own** the live `RobotCameraViewport` / `OccupancyMinimap` canvases (moved out of `App.tsx`); the single rendered copy owns the live feed whether panel or popped.
- `App.tsx` wraps the panel + overlays in `<DndProvider>`; the legacy unconditional camera/minimap floats are removed.
- `store.test.ts` updated for the move model: the per-instance `id` + `removePopped` tests became `undockWidget` tests (moves a kind back + reopens the panel; no-op for a non-popped kind).
- E2E: `widgets-drag.spec.ts` rewritten to drive dnd-kit with the **real `page.mouse`** (move onto handle → `mouse.down` → nudge past the 8px threshold → wait for `drop-zones` → move to edge → wait for `drop-zone-${edge}[data-over=true]` → `mouse.up`). Covers: drag start closes panel + shows zones; drop moves the lidar widget to an edge (panel handle count drops by one); close button moves it back; re-dock handle moves to a new edge; re-dropping never duplicates; the camera feed pops out carrying its live viewport, and closing returns the feed to the panel.
- Verified: `pnpm typecheck` clean, `pnpm test` 75/75, `pnpm test:e2e` 50/50, `pnpm lint` / `pnpm check` clean.

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

- **Unit (vitest):** `store` panel slice — `togglePanel`, `setTab`, `startDragWidget` (closes the panel + sets `draggingWidget`), `dropPoppedWidget(widget, edge)` moves the kind to that edge (singleton — re-dropping the same kind moves it), `cancelDragWidget` reopens without popping, `undockWidget(widget)` removes from `popped` + reopens the panel (no-op for a non-popped kind), `isWidgetPopped` selector.
- **E2E (playwright):**
  - `right-panel.spec.ts` — panel visible by default; collapse toggle hides it; each of the 5 tabs is selectable; the 5th tab requires horizontal scroll to become visible (assert it's off-strip until scrolled).
  - `widgets-drag.spec.ts` — drive a real dnd-kit drag with `page.mouse` (move onto the handle → `mouse.down` → nudge past the 8px activation threshold → wait for `drop-zones` → move to the edge → wait for `drop-zone-${edge}[data-over=true]` → `mouse.up`): assert drag start closes the panel + shows the zones, dropping moves the widget onto the edge (panel handle count drops by one — move, not duplicate), the close button moves it back, the re-dock handle moves it to a new edge, re-dropping never duplicates, and the camera feed pops out carrying its live viewport.
  - Update `smoke.spec.ts`/`sensors.spec.ts`/`navigation.spec.ts`/`teleoperation.spec.ts`/`localization.spec.ts`/`occupancy-grid.spec.ts` selectors that today target the scattered overlays (e.g. `nav-status`, `estop-button`, `lidar-toggle`, `clear-map-button`, `robot-pose`, `odometry-pose`) so they target the same controls now living inside the right panel tabs. Keep the `data-testid` attributes identical on the underlying controls to minimize churn.
- **Visual/parity:** quick manual pass: every slider label, value format (`fmt`/`deg`), button text, and toggle wording matches today's strings.

**Exit criteria:** all unit + e2e green; `pnpm typecheck` + `pnpm build` clean.

---
