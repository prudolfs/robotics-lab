// Path smoothing: shorten a grid-path by removing intermediate waypoints that
// sit on a straight line, then collapse collinear runs and (optionally) walk
// the path under a line-of-sight shortcut to skip safe cut-throughs.
//
// Smoothing is the last stage of milestone 8's "Features". The planner emits
// the cell path from A*/Dijkstra; smoothing turns that cell-zig-zag into a
// short list of world-space waypoints the controller can aim at one at a
// time. Two complementary passes are applied here:
//
//   1. `simplifyPath` — drop intermediate cells that lie exactly on the line
//      between their neighbours (pure dedupe: a 4-connected A* on a flat
//      corridor yields a string of cells; we keep only the turns). This is
//      cheap, deterministic, always safe, and is the default.
//   2. `shortcutPath` — line-of-sight relaxation: keep the start, then
//      greedily extend a target as far along the path as it is reachable by a
//      straight, collision-free segment. This removes the rest of the zig-zag,
//      gives a near-optimal route and is what makes a planned path visually
//      distinct from the raw A* cells.
//
// Collision-free segments are tested against the grid using the same
// inflation rule as the planner (for consistency) and a line-trace that walks
// the cells crossed by the segment via the simple DDA grid traversal from the
// occupancy-grid package — the same routine the mapping code uses to free
// cells. This keeps smoothing entirely in the deterministic, framework-free
// domain: take a grid + a path, return a shorter path.
//
// Everything here returns plain arrays of `Vec2` (world points) or `Cell2`
// (grid cells) so the renderer and the controller can consume it directly.

import type { Vec2 } from '@robotics-lab/geometry'
import {
	type Cell2,
	cellCenterWorld,
	classify,
	type OccupancyGrid,
	traceSegment,
} from '@robotics-lab/occupancy-grid'

/**
 * Drop intermediate cells that lie exactly on the straight line between their
 * neighbours. Returns a new (shorter) cell list, start and end preserved.
 *
 * Collinearity is tested with a tiny cross-product tolerance so floating
 * rounding on integer-cell paths never rejects a genuine straight run.
 */
export function simplifyPath(cells: Cell2[]): Cell2[] {
	if (cells.length <= 2) return cells.slice()
	const out: Cell2[] = [cells[0]]
	for (let i = 1; i < cells.length - 1; i++) {
		const prev = out[out.length - 1]
		const cur = cells[i]
		const next = cells[i + 1]
		if (!isCollinear(prev, cur, next)) out.push(cur)
	}
	out.push(cells[cells.length - 1])
	return out
}

/**
 * Line-of-sight shortcut over a cell path. Greedily walks forward through the
 * path, replacing it with a single straight jump every time a later cell is
 * reachable from the current cursor via an inflated-grid collision-free
 * segment. Produces the minimum set of "turn points" needed to follow the
 * route without scraping walls.
 *
 * `path` must already be the cell path returned by the planner (or its
 * `simplifyPath` reduction — this is idempotent against that output).
 */
export function shortcutPath(
	grid: OccupancyGrid,
	path: Cell2[],
	options: { inflationRadius?: number; allowUnknown?: boolean } = {},
): Cell2[] {
	if (path.length <= 2) return path.slice()
	const inflationRadius = options.inflationRadius ?? 1
	const allowUnknown = options.allowUnknown ?? true
	if (path.length <= 2) return path.slice()
	// Pre-build the blocked mask once so the line-of-sight tests share it with
	// the inflation semantics the planner used (keeps smoothing / planning in
	// agreement about what is impassable).
	const blocked = buildBlockedMask(grid, inflationRadius, allowUnknown)
	const out: Cell2[] = [path[0]]
	let cursor = 0
	let guard = 0
	while (cursor < path.length - 1) {
		// Walk forward to the farthest reachable cell from the cursor.
		let jumpTo = cursor + 1
		for (let k = path.length - 1; k > cursor + 1; k--) {
			const a = path[cursor]
			const b = path[k]
			if (segmentIsClear(grid, blocked, a, b)) {
				jumpTo = k
				break
			}
		}
		out.push(path[jumpTo])
		cursor = jumpTo
		if (guard++ > path.length * 2) break // pathological guard
	}
	return out
}

/** Convert a cell path to world-space waypoint centres. */
export function cellsToWorld(grid: OccupancyGrid, cells: Cell2[]): Vec2[] {
	return cells.map((c) => cellCenterWorld(grid, c.col, c.row))
}

/**
 * Convenience: turn a planner cell path into smoothed world-space waypoints
 * ready to be queued as navigation goals. Applies `simplifyPath` then
 * `shortcutPath`, then maps the surviving cells onto world centres.
 *
 * Endpoints (the robot start cell and the goal cell centres) are preserved so
 * the resulting waypoints always begin at the robot's cell and end at the
 * requested goal.
 */
export function smoothToWorld(
	grid: OccupancyGrid,
	cells: Cell2[],
	options: { inflationRadius?: number; allowUnknown?: boolean } = {},
): Vec2[] {
	const opts = {
		inflationRadius: options.inflationRadius ?? 1,
		allowUnknown: options.allowUnknown ?? true,
	}
	const simplified = simplifyPath(cells)
	const short = shortcutPath(grid, simplified, opts)
	return cellsToWorld(grid, short)
}

// --- internals ------------------------------------------------------------

/** True when (prev, cur, next) lie on a single straight line (within tolerance). */
function isCollinear(prev: Cell2, cur: Cell2, next: Cell2): boolean {
	// Cross product of (cur - prev) x (next - cur) == 0 for collinear points.
	const ax = cur.col - prev.col
	const ay = cur.row - prev.row
	const bx = next.col - cur.col
	const by = next.row - cur.row
	const cross = ax * by - ay * bx
	return Math.abs(cross) <= 1e-9
}

/**
 * True when the straight segment between cells `a` and `b` passes only through
 * unblocked cells (using the inflation mask). Uses the occupancy-grid DDA
 * traversal to enumerate the cells the segment crosses.
 */
function segmentIsClear(grid: OccupancyGrid, blocked: Uint8Array, a: Cell2, b: Cell2): boolean {
	const ax = grid.origin.x + (a.col + 0.5) * grid.resolution
	const ay = grid.origin.y + (a.row + 0.5) * grid.resolution
	const bx = grid.origin.x + (b.col + 0.5) * grid.resolution
	const by = grid.origin.y + (b.row + 0.5) * grid.resolution
	const visits = traceSegment(grid, ax, ay, bx, by)
	for (const v of visits) {
		if (v.index < 0) return false // leaving the grid is not "clear"
		if (blocked[v.index]) return false
	}
	return true
}

/**
 * Same inflation semantics as the planner (occupied -> blocked, plus a cell
 * square of `r` around each occupied cell). Unknown cells are blocked unless
 * `allowUnknown` is set, mirroring the planner's default.
 */
function buildBlockedMask(
	grid: OccupancyGrid,
	inflationRadius: number,
	allowUnknown: boolean,
): Uint8Array {
	const w = grid.width
	const h = grid.height
	const out = new Uint8Array(w * h)
	const r = inflationRadius
	const wantClass = (cls: ReturnType<typeof classify>): boolean => {
		if (cls === 'occupied') return true
		return cls === 'unknown' && !allowUnknown
	}
	for (let row = 0; row < h; row++) {
		for (let col = 0; col < w; col++) {
			const i = row * w + col
			if (wantClass(classify(grid.cells[i]))) {
				const rs = Math.max(0, row - r)
				const re = Math.min(h - 1, row + r)
				const cs = Math.max(0, col - r)
				const ce = Math.min(w - 1, col + r)
				for (let rr = rs; rr <= re; rr++) {
					for (let cc = cs; cc <= ce; cc++) {
						out[rr * w + cc] = 1
					}
				}
			}
		}
	}
	return out
}
