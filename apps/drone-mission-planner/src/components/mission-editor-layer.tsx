import { useThree } from '@react-three/fiber'
import type { MissionExecution } from '@robotics-lab/drone'
import { useEffect, useMemo, useRef } from 'react'
import { Plane, Quaternion, Raycaster, Vector2, Vector3 } from 'three'
import { missionRoutePoints, missionWaypoints } from '@/mission-plan'
import { usePlannerStore } from '@/store'

const up = new Vector3(0, 1, 0)

export function MissionEditorLayer({
	worldScale,
	missionExecution,
}: {
	worldScale: number
	missionExecution: MissionExecution
}) {
	const items = usePlannerStore((state) => state.missionItems)
	const selectedId = usePlannerStore((state) => state.selectedMissionItemId)
	const setSelected = usePlannerStore((state) => state.setSelectedMissionItem)
	const waypoints = missionWaypoints(items)
	const routePoints = useMemo(() => missionRoutePoints(items), [items])
	const route = routePoints.map(
		(point) =>
			[point.position.x, Math.max(0.06, point.position.y), point.position.z] as [
				number,
				number,
				number,
			],
	)
	const waypointAltitudes = new Map(routePoints.map((point) => [point.id, point.position.y]))

	return (
		<group>
			<MissionPointerController worldScale={worldScale} />
			{route.slice(1).map((point, index) => (
				<RouteSegment
					key={`mission-route-${routePoints[index + 1]?.id}`}
					start={route[index] ?? point}
					end={point}
				/>
			))}
			{missionExecution.target ? <CurrentTarget target={missionExecution.target} /> : null}
			<mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]}>
				<ringGeometry args={[0.42, 0.48, 48]} />
				<meshBasicMaterial color="#ffbd6a" />
			</mesh>
			{waypoints.map((waypoint, index) => {
				const height = Math.max(0.18, waypointAltitudes.get(waypoint.id) ?? 0)
				const selected = selectedId === waypoint.id
				return (
					<group key={waypoint.id} position={[waypoint.position.x, height, waypoint.position.y]}>
						<mesh
							scale={selected ? 1.45 : 1}
							onPointerDown={(event) => {
								event.stopPropagation()
								setSelected(waypoint.id)
							}}
						>
							<sphereGeometry args={[0.11, 20, 20]} />
							<meshStandardMaterial color={selected ? '#22d3ee' : '#f07a4b'} roughness={0.4} />
						</mesh>
						<mesh
							position={[0, -height + 0.045, 0]}
							rotation={[-Math.PI / 2, 0, 0]}
							scale={selected ? 1.375 : 1}
						>
							<torusGeometry args={[0.16, 0.025, 10, 32]} />
							<meshBasicMaterial color={selected ? '#22d3ee' : '#f07a4b'} />
						</mesh>
						<mesh position={[0, -height / 2, 0]}>
							<cylinderGeometry args={[0.008, 0.008, height, 8]} />
							<meshBasicMaterial
								color={selected ? '#22d3ee' : '#dba76c'}
								transparent
								opacity={0.42}
							/>
						</mesh>
						<mesh position={[0, 0.24, 0]}>
							<boxGeometry args={[0.18, 0.1, 0.02]} />
							<meshBasicMaterial color={selected ? '#083344' : '#40230f'} />
						</mesh>
						<mesh position={[0, 0.24, 0.012]}>
							<planeGeometry args={[0.12, 0.05]} />
							<meshBasicMaterial color={index % 2 === 0 ? '#fef3c7' : '#fed7aa'} />
						</mesh>
					</group>
				)
			})}
		</group>
	)
}

function CurrentTarget({ target }: { target: { x: number; y: number; z: number } }) {
	return (
		<group position={[target.x, target.y, target.z]}>
			<mesh rotation={[-Math.PI / 2, 0, 0]}>
				<torusGeometry args={[0.28, 0.035, 12, 36]} />
				<meshBasicMaterial color="#67e8f9" />
			</mesh>
			<mesh>
				<sphereGeometry args={[0.07, 16, 16]} />
				<meshBasicMaterial color="#ecfeff" />
			</mesh>
		</group>
	)
}

function MissionPointerController({ worldScale }: { worldScale: number }) {
	const { camera, gl } = useThree()
	const world = usePlannerStore((state) => state.world)
	const items = usePlannerStore((state) => state.missionItems)
	const editMode = usePlannerStore((state) => state.missionEditMode)
	const addWaypointAt = usePlannerStore((state) => state.addWaypointAt)
	const moveWaypoint = usePlannerStore((state) => state.moveMissionWaypoint)
	const setSelected = usePlannerStore((state) => state.setSelectedMissionItem)
	const itemsRef = useRef(items)
	const editModeRef = useRef(editMode)
	const draggingId = useRef<string | null>(null)
	itemsRef.current = items
	editModeRef.current = editMode

	useEffect(() => {
		const canvas = gl.domElement
		const raycaster = new Raycaster()
		const pointer = new Vector2()
		const ground = new Plane(new Vector3(0, 1, 0), 0)
		const intersection = new Vector3()
		const pickGround = (event: PointerEvent) => {
			const bounds = canvas.getBoundingClientRect()
			pointer.set(
				((event.clientX - bounds.left) / bounds.width) * 2 - 1,
				-((event.clientY - bounds.top) / bounds.height) * 2 + 1,
			)
			raycaster.setFromCamera(pointer, camera)
			if (!raycaster.ray.intersectPlane(ground, intersection)) return null
			const point = { x: intersection.x / worldScale, y: intersection.z / worldScale }
			if (Math.abs(point.x) > world.width / 2 || Math.abs(point.y) > world.depth / 2) return null
			return point
		}
		const stop = (event: PointerEvent) => {
			event.preventDefault()
			event.stopImmediatePropagation()
		}
		const onPointerDown = (event: PointerEvent) => {
			if (event.button !== 0) return
			const point = pickGround(event)
			if (!point) return
			if (editModeRef.current === 'add-waypoint') {
				stop(event)
				addWaypointAt(point)
				return
			}
			const waypoint = missionWaypoints(itemsRef.current).find(
				(candidate) =>
					Math.hypot(candidate.position.x - point.x, candidate.position.y - point.y) <= 0.45,
			)
			if (!waypoint) return
			stop(event)
			draggingId.current = waypoint.id
			setSelected(waypoint.id)
		}
		const onPointerMove = (event: PointerEvent) => {
			if (!draggingId.current || (event.buttons & 1) === 0) return
			const point = pickGround(event)
			if (!point) return
			stop(event)
			moveWaypoint(draggingId.current, point)
		}
		const onPointerUp = (event: PointerEvent) => {
			if (!draggingId.current) return
			stop(event)
			draggingId.current = null
		}
		canvas.addEventListener('pointerdown', onPointerDown, true)
		canvas.addEventListener('pointermove', onPointerMove, true)
		canvas.addEventListener('pointerup', onPointerUp, true)
		return () => {
			canvas.removeEventListener('pointerdown', onPointerDown, true)
			canvas.removeEventListener('pointermove', onPointerMove, true)
			canvas.removeEventListener('pointerup', onPointerUp, true)
		}
	}, [addWaypointAt, camera, gl, moveWaypoint, setSelected, world, worldScale])

	return null
}

function RouteSegment({
	start,
	end,
}: {
	start: [number, number, number]
	end: [number, number, number]
}) {
	const startVector = new Vector3(...start)
	const endVector = new Vector3(...end)
	const direction = endVector.clone().sub(startVector)
	if (direction.lengthSq() === 0) return null
	const midpoint = startVector.clone().add(endVector).multiplyScalar(0.5)
	const quaternion = new Quaternion().setFromUnitVectors(up, direction.clone().normalize())
	return (
		<mesh position={midpoint} quaternion={quaternion} scale={[1, direction.length(), 1]}>
			<cylinderGeometry args={[0.018, 0.018, 1, 8]} />
			<meshBasicMaterial color="#ffb85c" />
		</mesh>
	)
}
