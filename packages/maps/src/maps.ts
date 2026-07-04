// Built-in map registry + loader.
//
// The registry gives the simulator a set of ready-made worlds to switch
// between. `loadMap` resolves a name to its `MapData`, throwing for unknown
// names so callers fail loudly instead of silently rendering an empty world.

import type { MapData, Wall } from './index'

/** Four walls forming a rectangle of the given size, centred on the origin. */
function border(width: number, depth: number): Wall[] {
	const halfW = width / 2
	const halfD = depth / 2
	return [
		{ start: { x: -halfW, y: -halfD }, end: { x: halfW, y: -halfD } },
		{ start: { x: halfW, y: -halfD }, end: { x: halfW, y: halfD } },
		{ start: { x: halfW, y: halfD }, end: { x: -halfW, y: halfD } },
		{ start: { x: -halfW, y: halfD }, end: { x: -halfW, y: -halfD } },
	]
}

/** An empty rectangular arena, 8x8 metres. */
const empty: MapData = {
	name: 'empty',
	width: 8,
	depth: 8,
	walls: border(8, 8),
	boxes: [],
	cylinders: [],
}

/** A training room with scattered boxes and cylinders. */
const obstacles: MapData = {
	name: 'obstacles',
	width: 10,
	depth: 10,
	walls: border(10, 10),
	boxes: [
		{ center: { x: -2, y: 1 }, width: 1.5, depth: 1.5, rotation: 0.3 },
		{ center: { x: 2.5, y: -1 }, width: 2, depth: 1, rotation: -0.2 },
	],
	cylinders: [
		{ center: { x: 0, y: 2.5 }, diameter: 0.6 },
		{ center: { x: -3, y: -3 }, diameter: 0.9 },
		{ center: { x: 3, y: 3 }, diameter: 0.4 },
	],
}

/** Serpentine layout: a stack of boxes forming a slalom course. */
const slalom: MapData = {
	name: 'slalom',
	width: 12,
	depth: 8,
	walls: border(12, 8),
	boxes: [
		{ center: { x: -4, y: -2 }, width: 4, depth: 0.5, rotation: 0 },
		{ center: { x: 0, y: 2 }, width: 4, depth: 0.5, rotation: 0 },
		{ center: { x: 4, y: -2 }, width: 4, depth: 0.5, rotation: 0 },
	],
	cylinders: [],
}

/** All built-in maps keyed by name. */
export const MAPS: Record<string, MapData> = {
	[empty.name]: empty,
	[obstacles.name]: obstacles,
	[slalom.name]: slalom,
}

/** Names of every map in the registry, in declaration order. */
export function mapNames(): string[] {
	return Object.keys(MAPS)
}

/** Resolve a map by name; throws for unknown maps. */
export function loadMap(name: string): MapData {
	const map = MAPS[name]
	if (!map) throw new Error(`Unknown map: ${name}`)
	return map
}
