import { stereoProjection } from '@robotics-lab/vision'
import { useEffect, useSyncExternalStore } from 'react'
import { usePresentation } from '../store'
import type { Acquisition } from './runtime'
export function MapInspector({ acquisition }: { acquisition: Acquisition }) {
	const s = useSyncExternalStore(acquisition.subscribe, acquisition.getSnapshot),
		map = s.latest?.vo?.map,
		{ selectedMap, selectMap } = usePresentation()
	// biome-ignore lint/correctness/useExhaustiveDependencies: Selection IDs belong to one acquisition generation.
	useEffect(() => {
		selectMap(null)
	}, [s.generation, selectMap])
	const landmark =
			selectedMap?.kind === 'landmark'
				? map?.landmarks.find((p) => p.id === selectedMap.id)
				: undefined,
		keyframe =
			selectedMap?.kind === 'keyframe'
				? map?.keyframes.find((f) => f.id === selectedMap.id)
				: undefined
	const observations =
		landmark?.observations ??
		(keyframe
			? (map?.landmarks.flatMap((p) =>
					p.observations.filter((o) => o.keyframeId === keyframe.id),
				) ?? [])
			: [])
	return (
		<section className="inspector-section" aria-label="Sparse map">
			<div className="section-heading">
				<h2>Sparse map</h2>
				<span className="tiny-badge">LOCAL REFINEMENT</span>
			</div>
			<dl className="sensor-stats">
				<div>
					<dt>Revision / accepted frame</dt>
					<dd data-testid="map-revision">{map ? `${map.revision} / ${map.frameId}` : '—'}</dd>
				</div>
				<div>
					<dt>Landmarks / 1,000</dt>
					<dd data-testid="map-points">{map?.landmarks.length ?? 0}</dd>
				</div>
				<div>
					<dt>Keyframes / 12</dt>
					<dd data-testid="map-keyframes">{map?.keyframes.length ?? 0}</dd>
				</div>
				<div>
					<dt>Map PnP inliers</dt>
					<dd data-testid="map-matches">{map?.mapMatches ?? 0}</dd>
				</div>
				<div>
					<dt>Tracking support</dt>
					<dd>{map?.trackingSource ?? 'Waiting for stereo'}</dd>
				</div>
				<div>
					<dt>Local map update</dt>
					<dd>{map?.updateMs.toFixed(1) ?? '—'} ms</dd>
				</div>
				<div>
					<dt>Culled points / frames</dt>
					<dd>
						{map?.culledLandmarks ?? 0} / {map?.culledKeyframes ?? 0}
					</dd>
				</div>
			</dl>
			<p className="section-description" data-testid="map-bundle">
				{map?.bundle
					? `${map.bundle.reason}. Robust cost ${Number.isFinite(map.bundle.before) ? map.bundle.before.toFixed(3) : '—'} → ${Number.isFinite(map.bundle.after) ? map.bundle.after.toFixed(3) : '—'} px² · ${map.bundle.iterations} iterations · ${map.bundle.milliseconds.toFixed(1)} ms.`
					: 'Local refinement waits for shared observations across keyframes.'}
			</p>
			<p className="section-description">
				{map?.optimizationPending
					? 'Refinement running in a separate worker; tracking continues.'
					: 'Refinement worker idle.'}
			</p>
			<label className="map-select">
				Inspect reconstruction
				<select
					aria-label="Inspect map element"
					value={landmark ? `landmark:${landmark.id}` : keyframe ? `keyframe:${keyframe.id}` : ''}
					onChange={(e) => {
						const [kind, id] = e.target.value.split(':')
						selectMap(kind === 'landmark' || kind === 'keyframe' ? { kind, id: Number(id) } : null)
					}}
				>
					<option value="">Select a point or camera</option>
					<optgroup label="Keyframes">
						{map?.keyframes.map((f) => (
							<option key={f.id} value={`keyframe:${f.id}`}>
								Camera K{f.id} · frame {f.frameId}
							</option>
						))}
					</optgroup>
					<optgroup label="Landmarks">
						{map?.landmarks.map((p) => (
							<option key={p.id} value={`landmark:${p.id}`}>
								Point L{p.id} · {p.observations.length} views
							</option>
						))}
					</optgroup>
				</select>
			</label>
			<div className="map-selection" data-testid="map-selection">
				{landmark ? (
					<p>
						Landmark L{landmark.id} · quality {(landmark.quality * 100).toFixed(0)}% · seen{' '}
						{landmark.seen} times
						<br />
						Local XYZ {landmark.position.map((v) => v.toFixed(3)).join(' / ')} m
					</p>
				) : keyframe ? (
					<p>
						Keyframe K{keyframe.id} · {keyframe.timestamp.toFixed(2)} s<br />
						Local XYZ {keyframe.pose.position.map((v) => v.toFixed(3)).join(' / ')} m<br />
						Calibrated {keyframe.calibration.width} × {keyframe.calibration.height} ·{' '}
						{(keyframe.calibration.baseline * 1000).toFixed(0)} mm stereo
					</p>
				) : (
					<p>Click a reconstructed point or camera frustum, or choose one above.</p>
				)}
				{observations.length > 0 && (
					<>
						<p>{observations.length} linked observations · showing first 6</p>
						<table>
							<thead>
								<tr>
									<th>View / point</th>
									<th>u / v / uR</th>
									<th>Residual</th>
								</tr>
							</thead>
							<tbody>
								{observations.slice(0, 6).map((o) => {
									const f = map?.keyframes.find((f) => f.id === o.keyframeId),
										p = map?.landmarks.find((p) => p.id === o.landmarkId),
										uv = f && p ? stereoProjection(f.pose, p.position, f.calibration) : null
									return (
										<tr key={`${o.keyframeId}:${o.landmarkId}`}>
											<td>
												K{o.keyframeId} / L{o.landmarkId}
											</td>
											<td>{o.pixel.map((v) => v.toFixed(1)).join(' / ')}</td>
											<td>
												{uv ? Math.hypot(...uv.map((v, i) => v - o.pixel[i])).toFixed(2) : '—'} px
											</td>
										</tr>
									)
								})}
							</tbody>
						</table>
					</>
				)}
			</div>
			<p className="section-description">
				Poses, points and residuals belong to this revision. Blue cameras are retained keyframes;
				bright mint points have stronger support. The oldest local camera stays fixed during
				refinement. Verified revisits can correct the map; relocalization after loss remains
				unavailable.
				{s.replaying
					? ' Replay stays in its local optical frame; world placement is unavailable.'
					: ''}
			</p>
		</section>
	)
}
