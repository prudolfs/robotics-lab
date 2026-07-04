import type { Cylinder } from '@robotics-lab/maps'
import { worldToScene } from './coords'

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
					<mesh key={cylKey(c, i)} position={[x, y, z]} castShadow receiveShadow>
						<cylinderGeometry args={[c.diameter / 2, c.diameter / 2, h, 24]} />
						<meshStandardMaterial color="#0e7490" roughness={0.5} />
					</mesh>
				)
			})}
		</group>
	)
}
