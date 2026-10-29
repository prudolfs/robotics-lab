import { formatForDisplay, type RegisterableHotkey, useHotkeys } from '@tanstack/react-hotkeys'
import { Search } from 'lucide-react'
import { useWorkspace } from '../state/workspace'
import { Button } from './ui/button'
import {
	Command,
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandShortcut,
} from './ui/command'
import { Kbd } from './ui/kbd'

export type WorkspaceCommand = {
	id: string
	title: string
	group: string
	shortcut?: RegisterableHotkey
	enabled?: boolean
	reason?: string
	run: () => void
	keywords?: string[]
}
export function WorkspaceCommands({ commands }: { commands: WorkspaceCommand[] }) {
	const open = useWorkspace((state) => state.paletteOpen)
	useHotkeys([
		{
			hotkey: 'Mod+P',
			callback: () => useWorkspace.getState().setPalette(!useWorkspace.getState().paletteOpen),
			options: { ignoreInputs: false, preventDefault: true },
		},
		...commands
			.filter((command) => command.shortcut)
			.map((command) => ({
				hotkey: command.shortcut as RegisterableHotkey,
				callback: () => command.run(),
				options: {
					enabled: command.enabled !== false && !open,
					ignoreInputs: true,
					preventDefault: true,
				},
			})),
	])
	return (
		<>
			<Button
				variant="outline"
				size="sm"
				onClick={() => useWorkspace.getState().setPalette(true)}
				aria-label="Search commands"
			>
				<Search data-icon="inline-start" />
				<span className="hidden sm:inline">Search commands</span>
				<Kbd>{formatForDisplay('Mod+P')}</Kbd>
			</Button>
			<CommandDialog
				className="sm:max-w-xl"
				title="Greenhouse commands"
				description="Search panels and actions. Shortcuts are listed beside each command."
				open={open}
				onOpenChange={useWorkspace.getState().setPalette}
			>
				<Command>
					<CommandInput placeholder="Search panels and commands…" />
					<CommandList>
						<CommandEmpty>No matching commands.</CommandEmpty>
						{[...new Set(commands.map((command) => command.group))].map((group) => (
							<CommandGroup key={group} heading={group}>
								{commands
									.filter((command) => command.group === group)
									.map((command) => (
										<CommandItem
											key={command.id}
											value={`${command.title} ${command.reason ?? ''}`}
											keywords={command.keywords}
											disabled={command.enabled === false}
											onSelect={() => {
												useWorkspace.getState().setPalette(false)
												command.run()
											}}
										>
											<div className="min-w-0 flex-1">
												<p>{command.title}</p>
												{command.enabled === false && command.reason && (
													<p className="text-muted-foreground text-xs">{command.reason}</p>
												)}
											</div>
											{command.shortcut && (
												<CommandShortcut>{formatForDisplay(command.shortcut)}</CommandShortcut>
											)}
										</CommandItem>
									))}
							</CommandGroup>
						))}
					</CommandList>
				</Command>
			</CommandDialog>
		</>
	)
}
