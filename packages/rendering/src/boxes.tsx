import type { Box } from '@robotics-lab/maps'
import { Suspense } from 'react'
import { worldToScene } from './coords'
import { LabModel } from './lab-model'

const DEFAULT_BOX_ELEVATION = 0.5

const boxKey = (b: Box, i: number) => `box-${i}-${b.center.x},${b.center.y}-${b.width}x${b.depth}`

/** Render the boxes of a map as oriented cuboids standing on the floor. */
export function Boxes({ boxes }: { boxes: Box[] }) {
	return (
		<group>
			{boxes.map((box, i) => {
				const h = box.elevation ?? DEFAULT_BOX_ELEVATION
				const [x, y, z] = worldToScene(box.center, h / 2)
				return (
					<group key={boxKey(box, i)} position={[x, y, z]} rotation={[0, -box.rotation, 0]}>
						<group scale={[box.width, h, box.depth]}>
							<Suspense
								fallback={
									<mesh castShadow receiveShadow>
										<boxGeometry />
										<meshStandardMaterial color="#38645f" />
									</mesh>
								}
							>
								<LabModel name="lab-crate" />
							</Suspense>
						</group>
					</group>
				)
			})}
		</group>
	)
}
