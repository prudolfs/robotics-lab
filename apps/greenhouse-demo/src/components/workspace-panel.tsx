import { type ReactNode, useState } from 'react'
import { useWorkspace } from '../state/workspace'
import { ResizablePanel } from './ui/resizable'

/** Capture defaults once per orientation; changing them during a drag resets the split. */
export function WorkspacePanel({
	vertical,
	inspector = false,
	children,
}: {
	vertical: boolean
	inspector?: boolean
	children: ReactNode
}) {
	const [initial] = useState(() => {
		const state = useWorkspace.getState()
		return vertical ? state.mobileViewportSize : state.inspectorSize
	})
	return (
		<ResizablePanel
			id={inspector ? 'greenhouse-inspector' : 'greenhouse-viewport'}
			defaultSize={`${vertical ? (inspector ? 100 - initial : initial) : inspector ? initial : 100 - initial}%`}
			minSize={inspector ? (vertical ? '200px' : '340px') : vertical ? '220px' : '30%'}
			maxSize={inspector ? (vertical ? '75%' : '60%') : undefined}
			onResize={(size) => {
				if (vertical !== inspector) useWorkspace.getState().setLayout(vertical, size.asPercentage)
			}}
		>
			{children}
		</ResizablePanel>
	)
}
