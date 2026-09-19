/* Classic worker is intentional: pinned OpenCV is a UMD build. */
const boot = performance.now()
importScripts('/vendor/opencv.js')
const ready = new Promise((resolve) => {
	if (cv.Mat) resolve()
	else cv.onRuntimeInitialized = () => resolve()
})
self.onmessage = async ({ data }) => {
	try {
		await ready
		const required = [
			'goodFeaturesToTrack',
			'calcOpticalFlowPyrLK',
			'triangulatePoints',
			'solvePnP',
			'solvePnPRansac',
			'Rodrigues',
			'ORB',
			'BFMatcher',
		]
		const capabilities = Object.fromEntries(required.map((k) => [k, typeof cv[k]]))
		for (const k of required.filter((k) => k !== 'triangulatePoints'))
			if (typeof cv[k] !== 'function') throw Error('Missing ' + k)
		const owned = []
		const own = (x) => (owned.push(x), x)
		const mat = () => own(new cv.Mat())
		try {
			const gray = (rgba) => {
				const input = own(cv.matFromArray(480, 640, cv.CV_8UC4, rgba)),
					out = mat()
				cv.cvtColor(input, out, cv.COLOR_RGBA2GRAY)
				return out
			}
			const t = performance.now(),
				a = gray(data.frames[0].left),
				b = gray(data.frames[0].right),
				corners = mat(),
				mask = mat()
			cv.goodFeaturesToTrack(a, corners, 300, 0.02, 10, mask, 3, false, 0.04)
			const flow = (image, from, to, pts) => {
				const out = mat(),
					status = mat(),
					error = mat()
				cv.calcOpticalFlowPyrLK(
					from,
					to,
					pts,
					out,
					status,
					error,
					new cv.Size(21, 21),
					3,
					new cv.TermCriteria(3, 30, 0.01),
				)
				return { out, status, error }
			}
			const stereo = flow(null, a, b, corners),
				orig = [],
				right = []
			for (let i = 0; i < corners.rows; i++) {
				const u = corners.data32F[2 * i],
					v = corners.data32F[2 * i + 1],
					ru = stereo.out.data32F[2 * i],
					rv = stereo.out.data32F[2 * i + 1]
				if (
					stereo.status.data[i] &&
					Math.abs(v - rv) < 0.6 &&
					u - ru > 2 &&
					u - ru < 80 &&
					stereo.error.data32F[i] < 20
				) {
					orig.push(u, v)
					right.push(ru, rv)
				}
			}
			const n = orig.length / 2
			const { triangulate } = await import('/src/geometry.ts')
			const xyz = Array.from({ length: n }, (_, i) =>
				triangulate(orig[2 * i], orig[2 * i + 1], right[2 * i]),
			)
			const pts = own(cv.matFromArray(n, 1, cv.CV_32FC2, orig)),
				K = own(cv.matFromArray(3, 3, cv.CV_64F, [480, 0, 320, 0, 480, 240, 0, 0, 1])),
				dist = own(cv.Mat.zeros(4, 1, cv.CV_64F)),
				initializationMs = performance.now() - t,
				results = []
			for (const frame of data.frames.slice(1)) {
				const start = performance.now(),
					f = flow(null, a, gray(frame.left), pts),
					obj = [],
					img = []
				for (let i = 0; i < n; i++)
					if (f.status.data[i] && f.error.data32F[i] < 20) {
						obj.push(...xyz[i])
						img.push(f.out.data32F[2 * i], f.out.data32F[2 * i + 1])
					}
				const objects = own(cv.matFromArray(obj.length / 3, 1, cv.CV_32FC3, obj)),
					images = own(cv.matFromArray(img.length / 2, 1, cv.CV_32FC2, img)),
					rv = mat(),
					tv = mat(),
					inliers = mat()
				cv.setRNGSeed(42)
				const ok = cv.solvePnPRansac(
					objects,
					images,
					K,
					dist,
					rv,
					tv,
					false,
					100,
					2,
					0.99,
					inliers,
					cv.SOLVEPNP_ITERATIVE,
				)
				if (!ok) throw Error('PnP failed')
				results.push({
					pose: [...rv.data64F, ...tv.data64F],
					matches: img.length / 2,
					inliers: inliers.rows,
					ms: performance.now() - start,
				})
			}
			self.postMessage({
				capabilities,
				triangulation: 'TypeScript rectified disparity adapter; native triangulatePoints absent',
				initializationMs,
				features: corners.rows,
				stereoPoints: n,
				results,
				totalMs: performance.now() - t,
				bootAndRunMs: performance.now() - boot,
				wasmHeapBytes: cv.HEAP8.buffer.byteLength,
			})
		} finally {
			for (const x of owned.reverse()) x.delete()
		}
	} catch (e) {
		self.postMessage({ error: String(e), stack: e.stack })
	}
}
