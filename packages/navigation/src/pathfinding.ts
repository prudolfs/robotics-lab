// Grid search path planning over an occupancy grid: A* and Dijkstra.
//
// This module is the "Algorithms" half of milestone 8. It is deliberately
// framework independent and deterministic: it operates on the plain
// `OccupancyGrid` produced by `@robotics-lab/occupancy-grid` (log-odds cells
// where `>0` is occupied, `<0` is free, `0` is unknown) and returns the
// planning artefacts the renderer needs to visualize the search (the open
// set, the closed set and the final path).
//
// The grid is treated as a 4- or 8-connected (depending on `options.diagonal`)
// graph. Traversable cells are those *not* classified as occupied, with an
// optional inflation radius so the planned path keeps a safety distance from
// the wall (the robot has a body, so hugging a cell that the lidar only just
// marked occupied would clip through the obstacle).
//
// Both algorithms share the open/closed-set machinery; Dijkstra is just A*
// with a zero heuristic. We factor the priority-queue driven search into
// `search` and expose `aStar` / `dijkstra` as thin specializations so callers
// pick the algorithm by name without paying for two implementations.
//
// The cost model is Euclidean (octile for 8-connected) and ties are broken
// towards higher `g` so the search prefers paths already closer to the goal
// (a well-known trick that keeps the open set small and the returned path
// close to optimal without an extra smoothing pass).

import type { Cell2, OccupancyClass, OccupancyGrid } from '@robotics-lab/occupancy-grid'
import { classify } from '@robotics-lab/occupancy-grid'

export type { Cell2 } from '@robotics-lab/occupancy-grid'

/** Flat grid index of a (col, row) cell. */
function indexOf(grid: OccupancyGrid, col: number, row: number): number {
	return row * grid.width + col
}

/** Neighbour move descriptor: a (dCol, dRow) offset plus its step cost. */
type Move = { dc: number; dr: number; cost: number }

/** 4-connected moves (Manhattan neighbourhood). */
const MOVES_4: Move[] = [
	{ dc: 1, dr: 0, cost: 1 },
	{ dc: -1, dr: 0, cost: 1 },
	{ dc: 0, dr: 1, cost: 1 },
	{ dc: 0, dr: -1, cost: 1 },
]

/** 8-connected moves (Chebyshev neighbourhood); diagonal steps cost sqrt(2). */
const MOVES_8: Move[] = [
	...MOVES_4,
	{ dc: 1, dr: 1, cost: Math.SQRT2 },
	{ dc: 1, dr: -1, cost: Math.SQRT2 },
	{ dc: -1, dr: 1, cost: Math.SQRT2 },
	{ dc: -1, dr: -1, cost: Math.SQRT2 },
]

/** Tuning knobs for a single search. */
export type SearchOptions = {
	/** Allow diagonal moves (8-connected). Default `false` (4-connected). */
	diagonal?: boolean
	/**
	 * Safety inflation radius in *cells*. Cells within this many grid steps of
	 * an occupied cell are treated as impassable so the planned route keeps the
	 * robot's body clear of the obstacle. `0` disables inflation. Default `1`.
	 */
	inflationRadius?: number
	/**
	 * Treat `unknown` cells (no lidar evidence yet) as traversable. When
	 * `false` (default) the planner only routes through cells it knows are
	 * free, which is safer but fails to plan across unexplored space. Set
	 * `true` to let A* explore the unknown to reach the goal.
	 */
	allowUnknown?: boolean
	/** Maximum node expansions before the search gives up. Guards against
	 *  degenerate inputs eating the frame budget. Default 50_000. */
	maxIterations?: number
}

const DEFAULT_SEARCH_OPTIONS: Required<SearchOptions> = {
	diagonal: false,
	inflationRadius: 1,
	allowUnknown: true,
	maxIterations: 50_000,
}

/** Disposition of the planning request. */
export type SearchStatus = 'ok' | 'no_path' | 'invalid_start' | 'invalid_goal' | 'limit'

/** Full planning result: the path plus the search artefacts for visualization. */
export type SearchResult = {
	/** Outcome flag. `ok` means a path was found. */
	status: SearchStatus
	/** Cell path from start (inclusive) to goal (inclusive), in travel order.
	 *  Empty unless `status === 'ok'`. */
	path: Cell2[]
	/** Cost of the returned path in grid cells (`1` per orthogonal step,
	 *  `Math.SQRT2` per diagonal). `0` when no path. */
	cost: number
	/** Cells expanded into the closed set during the search (visited). */
	closed: Cell2[]
	/** Cells that were ever opened (queued in the priority frontier). */
	open: Cell2[]
	/** Number of iterations / node pops the search performed. */
	iterations: number
}

/** Heuristic estimator prototype: straight-line distance `start -> goal`. */
export type Heuristic = (a: { col: number; row: number }, b: { col: number; row: number }) => number

/** Euclidean distance in cell units. */
export function euclideanHeuristic(a: Cell2, b: Cell2): number {
	return Math.hypot(a.col - b.col, a.row - b.row)
}

/** Octile distance — admissible for 8-connected grids with cost 1 / sqrt(2). */
export function octileHeuristic(a: Cell2, b: Cell2): number {
	const dc = Math.abs(a.col - b.col)
	const dr = Math.abs(a.row - b.row)
	// 1 * (dc + dr) + (SQRT2 - 2) * min(dc, dr)
	return dc + dr + (Math.SQRT2 - 2) * Math.min(dc, dr)
}

/** Manhattan distance — admissible for 4-connected grids. */
export function manhattanHeuristic(a: Cell2, b: Cell2): number {
	return Math.abs(a.col - b.col) + Math.abs(a.row - b.row)
}

/** Zero heuristic — reduces A* to plain Dijkstra (minimum cost path). */
export function zeroHeuristic(_a: Cell2, _b: Cell2): number {
	return 0
}

/**
 * A* grid search over an occupancy grid. Returns the optimal path from
 * `start` to `goal` plus the open / closed sets for visualization.
 *
 * `start` / `goal` are cell coordinates. Use `worldToCell` from
 * `@robotics-lab/occupancy-grid` to derive them from world points.
 */
export function aStar(
	grid: OccupancyGrid,
	start: Cell2,
	goal: Cell2,
	options: SearchOptions = {},
): SearchResult {
	const opts = { ...DEFAULT_SEARCH_OPTIONS, ...options }
	const heuristic: Heuristic = opts.diagonal ? octileHeuristic : manhattanHeuristic
	return search(grid, start, goal, heuristic, opts)
}

/** Dijkstra grid search: same as A* with a zero heuristic. Optional, per
 *  the milestone. Useful as a reference baseline / debug comparison. */
export function dijkstra(
	grid: OccupancyGrid,
	start: Cell2,
	goal: Cell2,
	options: SearchOptions = {},
): SearchResult {
	const opts = { ...DEFAULT_SEARCH_OPTIONS, ...options }
	return search(grid, start, goal, zeroHeuristic, opts)
}

// --- Implementation -------------------------------------------------------

/**
 * Shared best-first search. A* and Dijkstra differ only in the heuristic,
 * so this is the single engine backing both.
 *
 * The frontier is a binary heap keyed by `f = g + h`, with ties broken towards
 * higher `g` (closer to the goal). `g` is the exact cost-to-come, `h` the
 * admissible estimate of cost-to-go. Visited cells are recorded in `cameFrom`
 * and `gScore` typed arrays (one entry per grid cell — the grid is small).
 *
 * Inflation is computed lazily as a binary "blocking" mask the heuristic
 * consults: a cell is blocked if it is occupied, or within `inflationRadius`
 * cells of an occupied cell. Computing the mask is one pass over the grid,
 * which is cheap at the default 200x200 = 40k cells.
 */
function search(
	grid: OccupancyGrid,
	start: Cell2,
	goal: Cell2,
	heuristic: Heuristic,
	opts: Required<SearchOptions>,
): SearchResult {
	const w = grid.width
	const h = grid.height
	const n = w * h

	// Validate endpoints: a planning request whose endpoints fall outside the
	// grid is meaningful to surface (the caller can recover by clamping), so
	// we report it as a distinct status rather than throwing.
	if (!inBounds(grid, start)) return emptyResult('invalid_start')
	if (!inBounds(grid, goal)) return emptyResult('invalid_goal')

	const blocked = buildBlockedMask(grid, opts)
	if (blocked[indexOf(grid, start.col, start.row)]) return emptyResult('invalid_start')
	if (blocked[indexOf(grid, goal.col, goal.row)]) return emptyResult('invalid_goal')

	const moves = opts.diagonal ? MOVES_8 : MOVES_4

	const gScore = new Float32Array(n).fill(Number.POSITIVE_INFINITY)
	const startIndex = indexOf(grid, start.col, start.row)
	const goalIndex = indexOf(grid, goal.col, goal.row)
	gScore[startIndex] = 0

	const cameFrom = new Int32Array(n).fill(-1)
	const closed = new Uint8Array(n)
	// The "open" set we return for visualization is the union of every cell that
	// was ever pushed to the frontier. We store it semantically: a cell is open
	// if it has been pushed at least once AND not yet closed.
	const wasOpened = new Uint8Array(n)

	// Binary heap of node indices keyed by (f, -g) so ties prefer higher g.
	// Each entry is [fLo, fHi] packed? Simpler: parallel arrays of index + key.
	let heapIdx = new Int32Array(n)
	let heapKey = new Float64Array(n)
	let heapNegG = new Float64Array(n)
	let heapSize = 0
	function heapPush(idx: number, f: number, g: number): void {
		heapIdx[heapSize] = idx
		heapKey[heapSize] = f
		heapNegG[heapSize] = -g
		// Sift up.
		let i = heapSize++
		while (i > 0) {
			const parent = (i - 1) >> 1
			if (heapLess(heapKey, heapNegG, i, parent)) {
				swap(i, parent)
				i = parent
			} else break
		}
	}
	function heapPop(): number | null {
		if (heapSize === 0) return null
		const top = heapIdx[0]
		heapSize--
		heapIdx[0] = heapIdx[heapSize]
		heapKey[0] = heapKey[heapSize]
		heapNegG[0] = heapNegG[heapSize]
		// Sift down.
		let i = 0
		while (true) {
			const l = 2 * i + 1
			const r = 2 * i + 2
			let best = i
			if (l < heapSize && heapLess(heapKey, heapNegG, l, best)) best = l
			if (r < heapSize && heapLess(heapKey, heapNegG, r, best)) best = r
			if (best === i) break
			swap(i, best)
			i = best
		}
		return top
	}
	function heapLess(keys: Float64Array, negGs: Float64Array, a: number, b: number): boolean {
		if (keys[a] !== keys[b]) return keys[a] < keys[b]
		return negGs[a] < negGs[b] // higher g => smaller negG => picked first
	}
	function swap(a: number, b: number): void {
		const ti = heapIdx[a]
		heapIdx[a] = heapIdx[b]
		heapIdx[b] = ti
		const tk = heapKey[a]
		heapKey[a] = heapKey[b]
		heapKey[b] = tk
		const tn = heapNegG[a]
		heapNegG[a] = heapNegG[b]
		heapNegG[b] = tn
	}

	const startH = heuristic(start, goal)
	heapPush(startIndex, startH, 0)
	wasOpened[startIndex] = 1

	let iterations = 0
	while (heapSize > 0) {
		if (iterations >= opts.maxIterations) {
			return collect(grid, cameFrom, closed, wasOpened, -1, iterations, 'limit')
		}
		iterations++
		const current = heapPop() as number
		if (closed[current]) continue
		closed[current] = 1
		if (current === goalIndex) {
			return collect(grid, cameFrom, closed, wasOpened, current, iterations, 'ok')
		}
		const cc = current % w
		const cr = Math.floor(current / w)
		const g = gScore[current]
		for (const move of moves) {
			const nc = cc + move.dc
			const nr = cr + move.dr
			if (nc < 0 || nc >= w || nr < 0 || nr >= h) continue
			const ni = nr * w + nc
			if (blocked[ni]) continue
			// Prevent diagonal clipping: a diagonal move requires *both* its
			// orthogonal neighbours to be clear (no cutting corners).
			if (move.dc !== 0 && move.dr !== 0) {
				const orth1 = cr * w + (cc + move.dc)
				const orth2 = (cr + move.dr) * w + cc
				if (blocked[orth1] || blocked[orth2]) continue
			}
			const tentative = g + move.cost
			if (tentative < gScore[ni]) {
				gScore[ni] = tentative
				cameFrom[ni] = current
				wasOpened[ni] = 1
				const cc2: Cell2 = { col: nc, row: nr }
				const f = tentative + heuristic(cc2, goal)
				heapPush(ni, f, tentative)
			}
		}
		// Grow the heap storage if we have nearly filled it. This keeps the
		// search robust on grids bigger than the default without recompiling.
		if (heapSize + moves.length > heapIdx.length) {
			const grow = Math.min(n, heapIdx.length * 2)
			const newIdx = new Int32Array(grow)
			const newKey = new Float64Array(grow)
			const newNegG = new Float64Array(grow)
			newIdx.set(heapIdx)
			newKey.set(heapKey)
			newNegG.set(heapNegG)
			heapIdx = newIdx
			heapKey = newKey
			heapNegG = newNegG
		}
	}

	// Frontier exhausted without reaching the goal: there is no route through
	// known free space. Surface the artefacts we did gather for debugging.
	return collect(grid, cameFrom, closed, wasOpened, -1, iterations, 'no_path')
}

function inBounds(grid: OccupancyGrid, cell: Cell2): boolean {
	return cell.col >= 0 && cell.col < grid.width && cell.row >= 0 && cell.row < grid.height
}

/**
 * Build a boolean "blocked" mask: `true` where the cell is occupied or within
 * `inflationRadius` of an occupied cell (and the inflation falls inside the
 * grid). Unknown cells are blocked unless `allowUnknown` is set.
 */
function buildBlockedMask(grid: OccupancyGrid, opts: Required<SearchOptions>): Uint8Array {
	const w = grid.width
	const h = grid.height
	const out = new Uint8Array(w * h)
	const r = opts.inflationRadius
	const wantClass = (cls: OccupancyClass): boolean => {
		if (cls === 'occupied') return true
		return cls === 'unknown' && !opts.allowUnknown
	}
	for (let row = 0; row < h; row++) {
		for (let col = 0; col < w; col++) {
			const i = row * w + col
			if (wantClass(classify(grid.cells[i]))) {
				// Block the obstacle and a square of `r` around it.
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

/** Assemble the public result from the search's internal arrays. */
function collect(
	grid: OccupancyGrid,
	cameFrom: Int32Array,
	closed: Uint8Array,
	wasOpened: Uint8Array,
	goalIndex: number,
	iterations: number,
	status: SearchStatus,
): SearchResult {
	const w = grid.width
	const closedCells: Cell2[] = []
	const openCells: Cell2[] = []
	for (let i = 0; i < closed.length; i++) {
		if (closed[i]) {
			closedCells.push({ col: i % w, row: Math.floor(i / w) })
		} else if (wasOpened[i]) {
			// Was queued but never settled — still "open" in the frontier.
			openCells.push({ col: i % w, row: Math.floor(i / w) })
		}
	}
	let path: Cell2[] = []
	let cost = 0
	if (status === 'ok' && goalIndex >= 0) {
		path = reconstructPath(cameFrom, goalIndex, w)
		cost = pathCost(grid, path)
	}
	return {
		status,
		path,
		cost,
		closed: closedCells,
		open: openCells,
		iterations,
	}
}

/** Walk `cameFrom` back from the goal to rebuild the cell path. */
function reconstructPath(cameFrom: Int32Array, goalIndex: number, w: number): Cell2[] {
	const out: Cell2[] = []
	let cur = goalIndex
	let guard = 0
	while (cur !== -1 && guard++ < cameFrom.length + 1) {
		out.push({ col: cur % w, row: Math.floor(cur / w) })
		cur = cameFrom[cur]
	}
	out.reverse()
	return out
}

/** Sum of Euclidean deltas between consecutive cells (in cell units). */
function pathCost(_grid: OccupancyGrid, path: Cell2[]): number {
	let sum = 0
	for (let i = 1; i < path.length; i++) {
		const a = path[i - 1]
		const b = path[i]
		sum += Math.hypot(b.col - a.col, b.row - a.row)
	}
	return sum
}

function emptyResult(status: SearchStatus): SearchResult {
	return { status, path: [], cost: 0, closed: [], open: [], iterations: 0 }
}
