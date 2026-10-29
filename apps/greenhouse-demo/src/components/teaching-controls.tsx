import { useCallback, useEffect, useRef } from 'react'
import type { Scene } from '../api/client'
import type { ActionData } from '../api/generated/http'
import { Button } from './ui/button'
import { FieldSet } from './ui/field'

const keys = ['w', 's', 'a', 'd', 'q', 'e'] as const
type Key = (typeof keys)[number]

export function TeachingControls({
	enabled,
	send,
	scene,
}: {
	enabled: boolean
	send: (action: ActionData) => void
	scene: Scene
}) {
	const panel = useRef<HTMLFieldSetElement>(null)
	const held = useRef(new Set<Key>())
	const action = useCallback(
		(): ActionData => ({
			throttle: (Number(held.current.has('w')) - Number(held.current.has('s'))) * 0.55,
			turn: (Number(held.current.has('a')) - Number(held.current.has('d'))) * 0.55,
			lift: Number(held.current.has('q')) - Number(held.current.has('e')),
			grip: 'hold',
		}),
		[],
	)
	const stop = useCallback(() => {
		held.current.clear()
		send({ throttle: 0, turn: 0, lift: 0, grip: 'hold' })
	}, [send])
	useEffect(() => {
		if (!enabled) {
			stop()
			return
		}
		const timer = setInterval(() => {
			if (held.current.size) send(action())
		}, 100)
		const visibility = () => {
			if (document.hidden) stop()
		}
		window.addEventListener('blur', stop)
		document.addEventListener('visibilitychange', visibility)
		return () => {
			clearInterval(timer)
			window.removeEventListener('blur', stop)
			document.removeEventListener('visibilitychange', visibility)
			stop()
		}
	}, [enabled, stop, send, action])
	return (
		<FieldSet
			ref={panel}
			aria-label="Manual teaching controls"
			tabIndex={0}
			className="flex flex-col gap-3 rounded-lg border border-border p-3 focus-visible:outline-2 focus-visible:outline-ring"
			onBlur={(event) => {
				if (!event.currentTarget.contains(event.relatedTarget)) stop()
			}}
			onKeyDown={(event) => {
				if (!enabled || event.repeat) return
				const key = event.key.toLowerCase()
				if (keys.includes(key as Key)) {
					event.preventDefault()
					held.current.add(key as Key)
					send(action())
				}
				if (key === 'g' || key === 'r') {
					event.preventDefault()
					send({ ...action(), grip: key === 'g' ? 'close' : 'open' })
				}
			}}
			onKeyUp={(event) => {
				const key = event.key.toLowerCase() as Key
				if (keys.includes(key)) {
					event.preventDefault()
					held.current.delete(key)
					send(action())
				}
			}}
		>
			<p className="font-medium text-sm">Teach Pip by doing</p>
			<p className="text-muted-foreground text-xs">
				Hold a button or focus this panel and use W/S, A/D and Q/E. G closes the gripper; R opens
				it.
			</p>
			<div className="grid grid-cols-2 gap-2">
				{(
					[
						['w', 'Forward'],
						['s', 'Backward'],
						['a', 'Turn left'],
						['d', 'Turn right'],
						['q', 'Lift up'],
						['e', 'Lift down'],
					] as const
				).map(([key, label]) => (
					<Button
						key={key}
						variant="secondary"
						size="sm"
						disabled={!enabled}
						onPointerDown={(event) => {
							event.preventDefault()
							panel.current?.focus()
							event.currentTarget.setPointerCapture(event.pointerId)
							held.current.add(key)
							send(action())
						}}
						onPointerUp={() => {
							held.current.delete(key)
							send(action())
						}}
						onPointerCancel={stop}
						onLostPointerCapture={() => {
							held.current.delete(key)
							send(action())
						}}
					>
						{label}
					</Button>
				))}
			</div>
			<div className="flex flex-wrap gap-2">
				<Button
					size="sm"
					variant="outline"
					disabled={!enabled}
					onClick={() => send({ ...action(), grip: 'close' })}
				>
					Close gripper
				</Button>
				<Button
					size="sm"
					variant="outline"
					disabled={!enabled}
					onClick={() => send({ ...action(), grip: 'open' })}
				>
					Open gripper
				</Button>
				<Button size="sm" variant="outline" disabled={!enabled} onClick={stop}>
					Stop motion
				</Button>
			</div>
			<dl className="grid grid-cols-2 gap-1 text-xs">
				<dt>Lift height</dt>
				<dd data-testid="lift-height">{scene.robot.lift_height.toFixed(3)} m</dd>
				<dt>Gripper</dt>
				<dd data-testid="holding-state">{scene.robot.holding ? 'Holding capsule' : 'Empty'}</dd>
				<dt>Target range</dt>
				<dd>{scene.observation.distance.toFixed(3)} m</dd>
				<dt>Target bearing</dt>
				<dd>{((scene.observation.bearing * 180) / Math.PI).toFixed(1)}°</dd>
				<dt>Measured speed</dt>
				<dd>{scene.observation.speed.toFixed(3)} m/s</dd>
			</dl>
			<p className="text-muted-foreground text-xs">
				Stop and align at about 0.34 m target range to grasp. Lower fully before releasing. Movement
				input expires after 250 ms without renewal.
			</p>
		</FieldSet>
	)
}
