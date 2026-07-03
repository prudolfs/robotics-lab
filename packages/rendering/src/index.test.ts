import { expect, test } from 'vitest'
import { RENDERING_PACKAGE_NAME } from './index'

test('package name is exported', () => {
	expect(RENDERING_PACKAGE_NAME).toBe('@robotics-lab/rendering')
})
