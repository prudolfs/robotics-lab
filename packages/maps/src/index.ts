// Map format, loader and serializer for simulation worlds.
//
// A map is a static description of the world geometry: the floor size plus the
// obstacles placed inside it. Maps are plain data so they can be serialized to
// JSON, stored and shared. All units are metres.
//
// Coordinate convention matches the simulator: x grows to the right, y grows
// up, the world origin (0, 0) is the center of the floor.
//
// All obstacle "elevation" fields (height above the floor) are purely visual
// and used by the renderer. The 2D simulation footprint is what matters.

import type { Vec2 } from '@robotics-lab/geometry'

/** Current map schema version, used by the loader for forward compatibility. */
export const MAP_FORMAT_VERSION = 1

export type Wall = {
	/** Wall start point in world space. */
	start: Vec2
	/** Wall end point in world space. */
	end: Vec2
	/** Wall thickness in metres (used by the renderer). */
	thickness?: number
	/** Wall height above the floor in metres (used by the renderer). */
	elevation?: number
}

export type Box = {
	center: Vec2
	/** Width along x in metres. */
	width: number
	/** Depth along y in metres. */
	depth: number
	/** Rotation about the box center, radians. */
	rotation: number
	/** Height above the floor in metres (used by the renderer). */
	elevation?: number
}

export type Cylinder = {
	center: Vec2
	/** Cylinder diameter in metres. */
	diameter: number
	/** Height above the floor in metres (used by the renderer). */
	elevation?: number
}

export type MapData = {
	version?: number
	name: string
	/** Floor width (x extent) in metres. */
	width: number
	/** Floor depth (y extent) in metres. */
	depth: number
	walls: Wall[]
	boxes: Box[]
	cylinders: Cylinder[]
}

export function createEmptyMap(params: { name: string; width: number; depth: number }): MapData {
	return {
		version: MAP_FORMAT_VERSION,
		name: params.name,
		width: params.width,
		depth: params.depth,
		walls: [],
		boxes: [],
		cylinders: [],
	}
}

/** Serialize a map to a pretty JSON string. */
export function serializeMap(map: MapData): string {
	return JSON.stringify({ ...map, version: MAP_FORMAT_VERSION }, null, 2)
}

/** Parse and lightly validate a JSON map string. */
export function parseMap(data: string): MapData {
	const parsed = JSON.parse(data) as Partial<MapData>
	// Accept the legacy `height` field as an alias for `depth`.
	const depth = parsed.depth ?? (parsed as { height?: number }).height
	if (!parsed.name || typeof parsed.width !== 'number' || typeof depth !== 'number') {
		throw new Error('Invalid map: missing name, width or depth')
	}
	return {
		version: parsed.version ?? MAP_FORMAT_VERSION,
		name: parsed.name,
		width: parsed.width,
		depth,
		walls: parsed.walls ?? [],
		boxes: parsed.boxes ?? [],
		cylinders: parsed.cylinders ?? [],
	}
}

export { loadMap, MAPS, mapNames } from './maps'
