// World editor widget (Editor tab) — milestone 12.
//
// The obstacle / wall editing controls. Each tool button toggles the active
// `editorTool` in the store; the actual pointer interaction is handled by the
// `EditorPicker` render component (App.tsx) which turns floor clicks into
// world-space edits (add wall, remove wall, move / resize, set spawn). This
// widget is purely the palette + the live obstacle inventory.
//
// As with every other widget: it only reads / writes UI state from the Zustand
// store. The store owns the world; the simulation loop reflects it into the
// sim via its existing `world` effect.

import { Button } from '@/components/ui/button'
import { WidgetCard } from '@/components/widgets/widget-card'
import { cn } from '@/lib/utils'
import type { EditorTool } from '@/store'
import { useSimulatorStore } from '@/store'

const TOOLS: { id: EditorTool; label: string; hint: string }[] = [
	{ id: 'addWall', label: 'Add wall', hint: 'click two floor points' },
	{ id: 'removeWall', label: 'Remove wall', hint: 'click a wall to delete it' },
	{ id: 'move', label: 'Move', hint: 'drag an obstacle to reposition it' },
	{ id: 'resize', label: 'Resize', hint: 'drag the selected box handles' },
]

export function WorldEditorWidget() {
	const tool = useSimulatorStore((s) => s.editorTool)
	const setTool = useSimulatorStore((s) => s.setEditorTool)
	const wallStart = useSimulatorStore((s) => s.wallStart)
	const selection = useSimulatorStore((s) => s.editorSelection)
	const clearSelection = useSimulatorStore((s) => s.clearEditorSelection)
	const world = useSimulatorStore((s) => s.world)

	const addWallMode = tool === 'addWall'
	const moveMode = tool === 'move' || tool === 'resize'

	return (
		<WidgetCard title="World editor" widget="editor.world" bodyClassName="gap-2">
			<div className="grid grid-cols-2 gap-1.5">
				{TOOLS.map((t) => (
					<Button
						key={t.id}
						data-testid={`editor-tool-${t.id}`}
						variant={tool === t.id ? 'default' : 'outline'}
						size="xs"
						onClick={() => setTool(tool === t.id ? 'none' : t.id)}
					>
						{t.label}
					</Button>
				))}
			</div>

			{/* Active tool hint / in-progress state. */}
			<div className="flex min-h-4 items-center">
				{tool !== 'none' && (
					<span
						className={cn(
							'font-mono text-[10px]',
							addWallMode && wallStart ? 'text-amber-400' : 'text-muted-foreground',
						)}
					>
						{addWallMode && wallStart
							? 'click the second endpoint…'
							: addWallMode
								? (TOOLS[0]?.hint ?? '')
								: TOOLS.find((t) => t.id === tool)?.hint}
					</span>
				)}
				{tool === 'none' && (
					<span className="font-mono text-[10px] text-muted-foreground">
						pick a tool, then click the floor
					</span>
				)}
			</div>

			{/* Live selection readout for move / resize. */}
			{moveMode && selection.kind !== 'none' && (
				<div className="flex items-center justify-between border-border border-b pb-1">
					<span data-testid="editor-selection" className="font-mono text-[11px] text-cyan-400">
						{selection.kind === 'box' && `box #${selection.index}`}
						{selection.kind === 'cylinder' && `cylinder #${selection.index}`}
						{selection.kind === 'wall' && `wall #${selection.index}`}
					</span>
					<Button variant="ghost" size="xs" onClick={clearSelection}>
						Deselect
					</Button>
				</div>
			)}

			{/* Obstacle inventory. */}
			<div className="flex flex-col gap-1 font-mono text-[11px] text-muted-foreground">
				<span data-testid="editor-count-walls">walls {world.walls.length}</span>
				<span data-testid="editor-count-boxes">boxes {world.boxes.length}</span>
				<span data-testid="editor-count-cyls">cylinders {world.cylinders.length}</span>
			</div>
		</WidgetCard>
	)
}
