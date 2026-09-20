import { createLocalMap, identity, incrementPose } from '@robotics-lab/vision'
import { expect, it } from 'vitest'
import { interpolateMap } from './map-animation'

it('animates a display copy while the committed map and pose remain unchanged', () => {
	const k = { width: 640, height: 480, fx: 480, fy: 480, cx: 320, cy: 240, baseline: 0.12 },
		map = createLocalMap(k)
	const a = map.update(0, 0, identity(), [], () => null),
		b = structuredClone(a)
	b.pose = incrementPose(identity(), [1, 2, 3, 0.2, 0.1, 0])
	b.keyframes[0].pose = b.pose
	const saved = structuredClone(b),
		mid = interpolateMap(a, b, 0.5)
	expect(mid.pose.position).toEqual([0.5, 1, 1.5])
	expect(b).toEqual(saved)
	expect(a.pose).toEqual(identity())
	expect(interpolateMap(a, b, 1).pose.position).toEqual(b.pose.position)
	expect(mid.keyframes[0].pose.position).toEqual(mid.pose.position)
})
