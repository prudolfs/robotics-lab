import { Children, isValidElement, type ReactNode } from 'react'
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from './ui/select'

type OptionProps = { value: string | number; children: ReactNode; disabled?: boolean }
export function ChoiceSelect({
	id,
	value,
	disabled,
	onValueChange,
	children,
}: {
	id: string
	value: string | number
	disabled?: boolean
	onValueChange: (value: string) => void
	children: ReactNode
}) {
	const items = Children.toArray(children)
		.filter(isValidElement<OptionProps>)
		.map((item) => ({ value: String(item.props.value), label: item.props.children }))
	return (
		<Select
			items={items}
			value={String(value)}
			onValueChange={(next) => onValueChange(next ?? '')}
			disabled={disabled}
		>
			<SelectTrigger id={id} className="w-full min-w-0">
				<SelectValue />
			</SelectTrigger>
			<SelectContent alignItemWithTrigger={false}>
				<SelectGroup>{children}</SelectGroup>
			</SelectContent>
		</Select>
	)
}
export function ChoiceOption({ value, children, disabled }: OptionProps) {
	return (
		<SelectItem value={String(value)} disabled={disabled} data-testid={`choice-${value}`}>
			{children}
		</SelectItem>
	)
}
