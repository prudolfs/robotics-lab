import type { Cylinder } from '@robotics-lab/maps'
import { Suspense } from 'react'
import { worldToScene } from './coords'
import { LabModel } from './lab-model'

const DEFAULT_CYL_ELEVATION = 0.6

const cylKey = (c: Cylinder, i: number) => `cyl-${i}-${c.center.x},${c.center.y}-${c.diameter}`

/** Render the cylinders of a map as upright drums on the floor. */
export function Cylinders({ cylinders }: { cylinders: Cylinder[] }) {
	return (
		<group>
			{cylinders.map((c, i) => {
				const h = c.elevation ?? DEFAULT_CYL_ELEVATION
				const [x, y, z] = worldToScene(c.center, h / 2)
				return (
					<group key={cylKey(c, i)} position={[x, y, z]} scale={[c.diameter, h, c.diameter]}>
						<Suspense
							fallback={
								<mesh castShadow receiveShadow>
									<cylinderGeometry args={[0.5, 0.5, 1, 24]} />
									<meshStandardMaterial color="#38645f" />
								</mesh>
							}
						>
							<LabModel name="lab-drum" />
						</Suspense>
					</group>
				)
			})}
		</group>
	)
}
