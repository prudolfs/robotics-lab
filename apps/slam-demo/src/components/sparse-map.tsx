import { Line } from '@react-three/drei'
import { type MapSnapshot, type Pose3, type V3, worldPoint } from '@robotics-lab/vision'
import { useCallback, useLayoutEffect, useRef } from 'react'
import { Color, type InstancedMesh, Object3D } from 'three'
import { usePresentation } from '../store'
export function SparseMap({ map, origin }: { map?: MapSnapshot; origin: Pose3 | null }) {
	const mesh = useRef<InstancedMesh>(null),
		{ showMap, showKeyframes, selectedMap, selectMap } = usePresentation()
	const convert = useCallback(
		(p: V3): V3 => {
			const q = origin ? worldPoint(origin, p) : p
			return [q[0], q[2], -q[1]]
		},
		[origin],
	)
	useLayoutEffect(() => {
		if (!mesh.current || !map || !showMap) return
		const object = new Object3D(),
			color = new Color()
		map.landmarks.forEach((p, i) => {
			object.position.set(...convert(p.position))
			object.scale.setScalar(
				selectedMap?.kind === 'landmark' && selectedMap.id === p.id ? 0.05 : 0.025,
			)
			object.updateMatrix()
			mesh.current?.setMatrixAt(i, object.matrix)
			color.set(
				selectedMap?.kind === 'landmark' && selectedMap.id === p.id
					? '#fff3af'
					: p.quality > 0.5
						? '#86f2db'
						: '#7397ac',
			)
			mesh.current?.setColorAt(i, color)
		})
		mesh.current.count = map.landmarks.length
		mesh.current.computeBoundingSphere()
		mesh.current.instanceMatrix.needsUpdate = true
		if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true
	}, [map, convert, selectedMap, showMap])
	if (!map || !origin) return null
	return (
		<group>
			{showMap && (
				// biome-ignore lint/a11y/noStaticElementInteractions: Three.js canvas picking; keyboard selection is in the map inspector.
				<instancedMesh
					ref={mesh}
					args={[undefined, undefined, 1000]}
					frustumCulled={false}
					onClick={(e) => {
						e.stopPropagation()
						const p = map.landmarks[e.instanceId ?? -1]
						if (p) selectMap({ kind: 'landmark', id: p.id })
					}}
				>
					<sphereGeometry args={[1, 6, 4]} />
					<meshBasicMaterial />
				</instancedMesh>
			)}
			{showKeyframes &&
				map.keyframes.map((f) => {
					const k = f.calibration,
						z = 0.22,
						w = (z * k.width) / (2 * k.fx),
						h = (z * k.height) / (2 * k.fy),
						corners: V3[] = [
							[-w, -h, z],
							[w, -h, z],
							[w, h, z],
							[-w, h, z],
						],
						center = convert(f.pose.position),
						c = corners.map((p) => convert(worldPoint(f.pose, p))),
						lines: V3[] = []
					for (let i = 0; i < 4; i++) lines.push(center, c[i], c[i], c[(i + 1) % 4])
					return (
						// biome-ignore lint/a11y/noStaticElementInteractions: Three.js canvas picking; keyboard selection is in the map inspector.
						<group
							key={f.id}
							onClick={(e) => {
								e.stopPropagation()
								selectMap({ kind: 'keyframe', id: f.id })
							}}
						>
							<Line
								points={lines}
								segments
								color={
									selectedMap?.kind === 'keyframe' && selectedMap.id === f.id
										? '#fff3af'
										: '#a1bafa'
								}
								lineWidth={1.4}
							/>
							<mesh position={center}>
								<sphereGeometry args={[0.045, 8, 6]} />
								<meshBasicMaterial color="#a1bafa" />
							</mesh>
						</group>
					)
				})}
		</group>
	)
}
