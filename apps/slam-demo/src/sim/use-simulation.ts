import { useEffect, useState, useSyncExternalStore } from 'react'
import { createController, type SimulationController } from './controller'
export function useSimulation() {
	const [controller] = useState(createController)
	const state = useSyncExternalStore(
		controller.subscribe,
		controller.getSnapshot,
		controller.getSnapshot,
	)
	useEffect(() => {
		let frame = 0,
			last: number | null = null
		function animate(now: number) {
			if (last !== null) controller.advance((now - last) / 1000)
			last = now
			frame = requestAnimationFrame(animate)
		}
		function suspend() {
			if (document.hidden) {
				controller.pause()
				last = null
			}
		}
		function blur() {
			controller.pause()
			last = null
		}
		frame = requestAnimationFrame(animate)
		document.addEventListener('visibilitychange', suspend)
		window.addEventListener('blur', blur)
		return () => {
			cancelAnimationFrame(frame)
			document.removeEventListener('visibilitychange', suspend)
			window.removeEventListener('blur', blur)
			controller.clearInput()
		}
	}, [controller])
	return { controller, state }
}
const keys: Record<string, string> = {
	w: 'forward',
	ArrowUp: 'forward',
	s: 'back',
	ArrowDown: 'back',
	a: 'left',
	ArrowLeft: 'left',
	d: 'right',
	ArrowRight: 'right',
}
export function useManualInput(controller: SimulationController) {
	const [held] = useState(() => new Set<string>())
	useEffect(() => {
		function update() {
			controller.command({
				forward: Number(held.has('forward')) - Number(held.has('back')),
				turn: Number(held.has('left')) - Number(held.has('right')),
			})
		}
		function down(e: KeyboardEvent) {
			if (
				e.target instanceof HTMLElement &&
				e.target.closest('input,select,textarea,[contenteditable]')
			)
				return
			if (
				e.code === 'Space' &&
				controller.read().status !== 'running' &&
				e.target instanceof HTMLElement &&
				e.target.closest('button')
			)
				return
			if (e.code === 'Space') {
				e.preventDefault()
				controller.pause()
				held.clear()
				return
			}
			const action = keys[e.key]
			if (!action || controller.read().config.mode !== 'manual') return
			e.preventDefault()
			held.add(action)
			update()
		}
		function up(e: KeyboardEvent) {
			const action = keys[e.key]
			if (action) {
				held.delete(action)
				update()
			}
		}
		function clear() {
			held.clear()
			controller.clearInput()
		}
		window.addEventListener('keydown', down)
		window.addEventListener('keyup', up)
		window.addEventListener('blur', clear)
		// Every transport/config transition clears held input; a resumed drive requires a fresh key press.
		let status = controller.read().status
		const unsubscribe = controller.subscribe(() => {
			const next = controller.read().status
			if (next !== status) {
				clear()
				status = next
			}
		})
		return () => {
			window.removeEventListener('keydown', down)
			window.removeEventListener('keyup', up)
			window.removeEventListener('blur', clear)
			unsubscribe()
			clear()
		}
	}, [controller, held])
	return function press(action: string, active: boolean) {
		if (active) held.add(action)
		else held.delete(action)
		controller.command({
			forward: Number(held.has('forward')) - Number(held.has('back')),
			turn: Number(held.has('left')) - Number(held.has('right')),
		})
	}
}
