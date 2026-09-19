export type V3 = [number, number, number]
export type Pixel = [number, number]
export type Calibration = {
	width: number
	height: number
	fx: number
	fy: number
	cx: number
	cy: number
	baseline: number
}
export type Pose3 = { rotation: number[]; position: V3 }
export type FeatureOverlay = {
	u: number
	v: number
	from?: Pixel
	prediction?: Pixel
	accepted: boolean
	reason: string
}
export type OdometryResult = {
	map?: import('./mapping').MapSnapshot
	status: 'initializing' | 'tracking' | 'degraded' | 'lost'
	reason: string
	frameId: number
	timestamp: number
	referenceFrameId: number | null
	acceptedFrameId: number | null
	pose: Pose3 | null
	detected: number
	stereo: number
	matches: number
	inliers: number
	rmse: number | null
	coverage: number
	overlays: FeatureOverlay[]
	nativeObjects: number
	peakNativeObjects: number
	wasmHeapBytes: number
}
/** Small explicit facade for the pinned OpenCV.js API, injected by browser/Node adapters. */
export interface Mat {
	rows: number
	cols: number
	data: Uint8Array
	data32F: Float32Array
	data64F: Float64Array
	data32S: Int32Array
	delete(): void
	copyTo(other: Mat): void
}
export interface Cv {
	Mat: {
		new (rows?: number, cols?: number, type?: number): Mat
		zeros(rows: number, cols: number, type: number): Mat
	}
	matFromArray(rows: number, cols: number, type: number, data: ArrayLike<number>): Mat
	CV_8UC1: number
	CV_32FC2: number
	CV_32FC3: number
	CV_64F: number
	SOLVEPNP_ITERATIVE: number
	HEAP8: Int8Array
	Size: new (w: number, h: number) => unknown
	TermCriteria: new (type: number, count: number, epsilon: number) => unknown
	goodFeaturesToTrack(
		image: Mat,
		corners: Mat,
		max: number,
		quality: number,
		distance: number,
		mask: Mat,
		block: number,
		harris: boolean,
		k: number,
	): void
	calcOpticalFlowPyrLK(
		a: Mat,
		b: Mat,
		points: Mat,
		out: Mat,
		status: Mat,
		error: Mat,
		size: unknown,
		levels: number,
		criteria: unknown,
	): void
	solvePnPRansac(
		obj: Mat,
		img: Mat,
		k: Mat,
		dist: Mat,
		r: Mat,
		t: Mat,
		guess: boolean,
		iterations: number,
		error: number,
		confidence: number,
		inliers: Mat,
		flags: number,
	): boolean
	solvePnP(
		obj: Mat,
		img: Mat,
		k: Mat,
		dist: Mat,
		r: Mat,
		t: Mat,
		guess: boolean,
		flags: number,
	): boolean
	Rodrigues(r: Mat, out: Mat): void
	setRNGSeed(seed: number): void
}
