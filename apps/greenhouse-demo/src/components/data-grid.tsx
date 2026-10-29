import {
	columnFilteringFeature,
	createColumnHelper,
	createFilteredRowModel,
	createPaginatedRowModel,
	createSortedRowModel,
	filterFn_includesString,
	globalFilteringFeature,
	rowPaginationFeature,
	rowSortingFeature,
	sortFn_alphanumeric,
	tableFeatures,
	useTable,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { type ReactNode, useMemo } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'

const features = tableFeatures({
	columnFilteringFeature,
	globalFilteringFeature,
	filteredRowModel: createFilteredRowModel(),
	filterFns: { includesString: filterFn_includesString },
	rowSortingFeature,
	sortedRowModel: createSortedRowModel(),
	sortFns: { alphanumeric: sortFn_alphanumeric },
	rowPaginationFeature,
	paginatedRowModel: createPaginatedRowModel(),
})
export type GridColumn<T> = {
	id: string
	header: string
	value: (row: T) => string | number
	cell: (row: T) => ReactNode
	sort?: boolean
}
export function DataGrid<T extends object>({
	data,
	columns,
	label,
	rowId,
	rowTestId,
	selectedId,
	search = true,
}: {
	data: T[]
	columns: GridColumn<T>[]
	label: string
	rowId: (row: T) => string
	rowTestId?: (row: T) => string
	selectedId?: string
	search?: boolean
}) {
	const definitions = useMemo(() => {
		const helper = createColumnHelper<typeof features, T>()
		return helper.columns(
			columns.map((column) =>
				helper.accessor(column.value, {
					id: column.id,
					header: column.header,
					cell: ({ row }) => column.cell(row.original),
					enableSorting: column.sort !== false,
					sortFn: 'alphanumeric',
				}),
			),
		)
	}, [columns])
	const table = useTable<typeof features, T>({
		features,
		data,
		columns: definitions,
		getRowId: rowId,
		globalFilterFn: 'includesString',
		initialState: { pagination: { pageIndex: 0, pageSize: 10 } },
	})
	return (
		<div className="flex min-w-0 flex-col gap-3">
			{search && (
				<Input
					aria-label={`Search ${label}`}
					placeholder="Filter records…"
					value={String(table.state.globalFilter ?? '')}
					onChange={(event) => table.setGlobalFilter(event.target.value)}
				/>
			)}
			<Table aria-label={label}>
				<TableHeader>
					{table.getHeaderGroups().map((group) => (
						<TableRow key={group.id}>
							{group.headers.map((header) => (
								<TableHead
									key={header.id}
									aria-sort={
										header.column.getIsSorted() === 'asc'
											? 'ascending'
											: header.column.getIsSorted() === 'desc'
												? 'descending'
												: 'none'
									}
								>
									{header.column.getCanSort() ? (
										<Button
											variant="ghost"
											size="sm"
											onClick={header.column.getToggleSortingHandler()}
										>
											<table.FlexRender header={header} />
											{header.column.getIsSorted() === 'asc' ? (
												<ArrowUp data-icon="inline-end" />
											) : header.column.getIsSorted() === 'desc' ? (
												<ArrowDown data-icon="inline-end" />
											) : (
												<ArrowUpDown data-icon="inline-end" />
											)}
										</Button>
									) : (
										<table.FlexRender header={header} />
									)}
								</TableHead>
							))}
						</TableRow>
					))}
				</TableHeader>
				<TableBody>
					{table.getRowModel().rows.map((row) => (
						<TableRow
							key={row.id}
							data-testid={rowTestId?.(row.original)}
							data-state={selectedId === row.id ? 'selected' : undefined}
						>
							{row.getAllCells().map((cell) => (
								<TableCell key={cell.id}>
									<table.FlexRender cell={cell} />
								</TableCell>
							))}
						</TableRow>
					))}
					{table.getRowModel().rows.length === 0 && (
						<TableRow>
							<TableCell colSpan={columns.length}>No matching records.</TableCell>
						</TableRow>
					)}
				</TableBody>
			</Table>
			{data.length > 10 && (
				<div className="flex items-center justify-between gap-2 text-muted-foreground text-xs">
					<span>
						{table.getFilteredRowModel().rows.length} records · page{' '}
						{table.state.pagination.pageIndex + 1} / {Math.max(1, table.getPageCount())}
					</span>
					<div className="flex gap-1">
						<Button
							aria-label={`Previous ${label} page`}
							size="icon-sm"
							variant="outline"
							disabled={!table.getCanPreviousPage()}
							onClick={() => table.previousPage()}
						>
							<ChevronLeft />
						</Button>
						<Button
							aria-label={`Next ${label} page`}
							size="icon-sm"
							variant="outline"
							disabled={!table.getCanNextPage()}
							onClick={() => table.nextPage()}
						>
							<ChevronRight />
						</Button>
					</div>
				</div>
			)}
		</div>
	)
}
