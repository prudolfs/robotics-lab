// Map format, loader and serializer for simulation worlds.

import type { Vec2 } from '@robotics-lab/geometry'

export type Wall = {
	start: Vec2
	end: Vec2
}

export type Box = {
	center: Vec2
	width: number
	height: number
	rotation: number
}

export type MapData = {
	name: string
	width: number
	height: number
	walls: Wall[]
	boxes: Box[]
}

export function createEmptyMap(params: { name: string; width: number; height: number }): MapData {
	return {
		name: params.name,
		width: params.width,
		height: params.height,
		walls: [],
		boxes: [],
	}
}

export function serializeMap(map: MapData): string {
	return JSON.stringify(map, null, 2)
}

export function parseMap(data: string): MapData {
	return JSON.parse(data) as MapData
}
