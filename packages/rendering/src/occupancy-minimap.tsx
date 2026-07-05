// Occupancy minimap: a top-down HTML canvas overlay.
//
// Lives outside the R3F `<Canvas>` (see `App.tsx`), like the robot camera
// viewport. It paints a top-down projection of the current occupancy grid over
// a faint world-compass backdrop, overlaying the robot pose and the latest
// lidar scan footprint. Updating every frame makes the map "draw itself" live
// as the robot drives — the same effect as the in-scene `OccupancyGridView`,
// just in a small fixed corner panel that stays visible regardless of camera
// angle.
//
// Only observes immutable state from the store; owns no simulation state.

import type { Pose, World } from '@robotics-lab/core'
import type { OccupancyGrid } from '@robotics-lab/occupancy-grid'
import { classify } from '@robotics-lab/occupancy-grid'
import type { LidarScan } from '@robotics-lab/sensors'
import { useEffect, useRef } from 'react'

export type OccupancyMinimapProps = {
	/** The occupancy grid to paint. `null` shows the world only. */
	grid: OccupancyGrid | null
	/** The world, drawn faded behind the grid for context. */
	world: World
	/** Current robot pose overlay. */
	pose: Pose
	/** Latest lidar scan footprint overlay (the scanned dot pattern). */
	scan: LidarScan | null
	/** Canvas pixel size (the panel is square). */
	size?: number
	/** Tailwind/CSS classes to position/size the panel from the parent. */
	className?: string
}

const BG = '#0a0a0a'
const WORLD_LINE = 'rgba(148, 163, 184, 0.35)'
const FREE_COLOR = 'rgba(34, 197, 94, 0.4)'
const OCCUPIED_COLOR = 'rgba(239, 68, 68, 0.95)'
const ROBOT_COLOR = '#38bdf8'
const SCAN_COLOR = 'rgba(251, 191, 36, 0.6)'

export function OccupancyMinimap({
	grid,
	world,
	pose,
	scan,
	size = 160,
	className,
}: OccupancyMinimapProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null)

	// Paint on every render — React feeds us a fresh grid/pose/scan each frame.
	useEffect(() => {
		const canvas = canvasRef.current
		if (!canvas) return
		const ctx = canvas.getContext('2d')
		if (!ctx) return
		const dpr = window.devicePixelRatio || 1
		const cssSize = size
		canvas.width = Math.floor(cssSize * dpr)
		canvas.height = Math.floor(cssSize * dpr)
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
		ctx.fillStyle = BG
		ctx.fillRect(0, 0, cssSize, cssSize)

		// Choose a world framing window: prefer the grid, fall back to the world.
		const framer = grid
			? {
					minX: grid.origin.x,
					minY: grid.origin.y,
					maxX: grid.origin.x + grid.width * grid.resolution,
					maxY: grid.origin.y + grid.height * grid.resolution,
				}
			: {
					minX: -world.width / 2,
					minY: -world.depth / 2,
					maxX: world.width / 2,
					maxY: world.depth / 2,
				}
		const frame = frameBounds(framer, world)
		const scale = cssSize / (frame.maxX - frame.minX) // px per world unit
		const toMin = (x: number, y: number): [number, number] => [
			((x - frame.minX) / (frame.maxX - frame.minX)) * cssSize,
			((y - frame.minY) / (frame.maxY - frame.minY)) * cssSize,
		]

		// World outline (subtle context).
		ctx.lineWidth = 1
		ctx.strokeStyle = WORLD_LINE
		drawWorld(ctx, world, toMin, scale)

		// Occupancy grid cells.
		if (grid) drawGrid(ctx, grid, toMin, scale)

		// Latest scan footprint.
		if (scan) drawScan(ctx, scan, toMin)

		// Robot pose.
		drawRobot(ctx, pose, toMin)
	}, [grid, world, pose, scan, size])

	return (
		<canvas
			ref={canvasRef}
			width={size}
			height={size}
			className={className}
			aria-label="Occupancy minimap"
		/>
	)
}

/**
 * Compute the world bounds to show. Prefers the occupancy grid extent, but
 * falls back to the world's floor bounds so the minimap always orients around
 * something sensible even before any scan has run.
 */
function frameBounds(
	framer: { minX: number; minY: number; maxX: number; maxY: number },
	world: World,
) {
	const margin = 0.5
	return {
		minX: Math.min(framer.minX, world.width / -2) - margin,
		minY: Math.min(framer.minY, world.depth / -2) - margin,
		maxX: Math.max(framer.maxX, world.width / 2) + margin,
		maxY: Math.max(framer.maxY, world.depth / 2) + margin,
	}
}

function drawWorld(
	ctx: CanvasRenderingContext2D,
	world: World,
	toMin: (x: number, y: number) => [number, number],
	scale: number,
) {
	const r = scale
	for (const wall of world.walls) {
		const [x1, y1] = toMin(wall.start.x, wall.start.y)
		const [x2, y2] = toMin(wall.end.x, wall.end.y)
		ctx.beginPath()
		ctx.moveTo(x1, y1)
		ctx.lineTo(x2, y2)
		ctx.stroke()
	}
	for (const cyl of world.cylinders) {
		const [cx, cy] = toMin(cyl.center.x, cyl.center.y)
		const radiusPx = Math.max(1, cyl.radius * r)
		ctx.beginPath()
		ctx.arc(cx, cy, radiusPx, 0, Math.PI * 2)
		ctx.stroke()
	}
	for (const box of world.boxes) {
		drawBox(ctx, box.center, box.width, box.depth, box.rotation, toMin)
	}
}

function drawBox(
	ctx: CanvasRenderingContext2D,
	center: { x: number; y: number },
	width: number,
	depth: number,
	rotation: number,
	toMin: (x: number, y: number) => [number, number],
) {
	const corners = [
		{ x: -width / 2, y: -depth / 2 },
		{ x: width / 2, y: -depth / 2 },
		{ x: width / 2, y: depth / 2 },
		{ x: -width / 2, y: depth / 2 },
	].map((p) => rotate(p, rotation))
	ctx.beginPath()
	corners.forEach((c, i) => {
		const [x, y] = toMin(center.x + c.x, center.y + c.y)
		if (i === 0) ctx.moveTo(x, y)
		else ctx.lineTo(x, y)
	})
	ctx.closePath()
	ctx.stroke()
}

function rotate(p: { x: number; y: number }, radians: number) {
	const c = Math.cos(radians)
	const s = Math.sin(radians)
	return { x: p.x * c - p.y * s, y: p.x * s + p.y * c }
}

function drawGrid(
	ctx: CanvasRenderingContext2D,
	grid: OccupancyGrid,
	toMin: (x: number, y: number) => [number, number],
	scale: number,
) {
	const res = grid.resolution
	const cellPx = Math.max(1, res * scale)
	for (let i = 0; i < grid.cells.length; i++) {
		const cls = classify(grid.cells[i])
		if (cls === 'unknown') continue
		const col = i % grid.width
		const row = Math.floor(i / grid.width)
		const x = grid.origin.x + col * res
		const y = grid.origin.y + row * res
		const [px, py] = toMin(x, y)
		ctx.fillStyle = cls === 'free' ? FREE_COLOR : OCCUPIED_COLOR
		ctx.fillRect(px, py, cellPx, cellPx)
	}
}

function drawScan(
	ctx: CanvasRenderingContext2D,
	scan: LidarScan,
	toMin: (x: number, y: number) => [number, number],
) {
	ctx.fillStyle = SCAN_COLOR
	for (const sample of scan.samples) {
		if (sample.hit === null) continue
		const a = scan.origin.heading + sample.angle
		const x = scan.origin.x + Math.cos(a) * sample.distance
		const y = scan.origin.y + Math.sin(a) * sample.distance
		const [px, py] = toMin(x, y)
		ctx.fillRect(px - 1, py - 1, 2, 2)
	}
}

function drawRobot(
	ctx: CanvasRenderingContext2D,
	pose: Pose,
	toMin: (x: number, y: number) => [number, number],
) {
	const [px, py] = toMin(pose.x, pose.y)
	ctx.fillStyle = ROBOT_COLOR
	ctx.beginPath()
	ctx.arc(px, py, 4, 0, Math.PI * 2)
	ctx.fill()
	// Heading arrow.
	const hx = px + Math.cos(pose.heading) * 8
	const hy = py + Math.sin(pose.heading) * 8
	ctx.strokeStyle = ROBOT_COLOR
	ctx.lineWidth = 2
	ctx.beginPath()
	ctx.moveTo(px, py)
	ctx.lineTo(hx, hy)
	ctx.stroke()
}
