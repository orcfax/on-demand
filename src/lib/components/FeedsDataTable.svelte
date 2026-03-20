<script module lang="ts">
	let firstFetchTracked = false;
</script>

<script lang="ts">
	import {
		type ColumnDef,
		type ColumnFiltersState,
		type ExpandedState,
		type SortingState,
		type RowSelectionState,
		getCoreRowModel,
		getExpandedRowModel,
		getFilteredRowModel,
		getSortedRowModel
	} from '@tanstack/table-core';
	import { createRawSnippet } from 'svelte';
	import * as Table from '$lib/components/ui/table/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import {
		FlexRender,
		createSvelteTable,
		renderSnippet,
		renderComponent
	} from '$lib/components/ui/data-table/index.js';
	import DataTableCheckbox from './ui/data-table/data-table-checkbox.svelte';
	import DataTableSortButton from './ui/data-table/data-table-sort-button.svelte';
	import Button from './ui/button/button.svelte';
	import Spinner from './ui/spinner/spinner.svelte';
	import RefreshCcwDotIcon from '@lucide/svelte/icons/refresh-ccw-dot';
	import PackagePlus from '@lucide/svelte/icons/package-plus';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import FeedActions from '$lib/components/FeedActions.svelte';
	import FeedPriceDisplay from './FeedPriceDisplay.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { getODAPIState, type FeedData } from '$lib/odapi/odapi.svelte';
	import { notify } from '$lib/toast';
	import { getErrorMessage } from '$lib/errors';
	import { track } from '$lib/analytics';
	import { SvelteMap } from 'svelte/reactivity';

	// Get ODAPI instance from context
	const odapi = getODAPIState();

	// Get reactive data from ODAPI
	const data = $derived(odapi.feedData);
	const feedHistory = $derived(odapi.feedHistoryMap);
	const loading = $derived(odapi.loading);
	const errorMessage = $derived(odapi.error);

	// Bulk operation state
	let isBulkUpdating = $state(false);
	let isBulkPublishing = $state(false);

	// Table columns configuration
	const columns: ColumnDef<FeedData>[] = [
		{
			id: 'expand',
			header: () => '',
			enableSorting: false,
			enableHiding: false,
			cell: ({ row }) => {
				return renderComponent(Button, {
					children: createRawSnippet(() => ({
						render: () => `<span>${row.getIsExpanded() ? '▼' : '▶'}</span>`
					})),
					variant: 'ghost',
					class: 'h-8 w-8 p-0',
					disabled: !odapi.hasExpandableHistory(row.original.feedId),
					onclick: async () => {
						if (!row.getIsExpanded()) {
							await odapi.loadFeedHistory(row.original.feedId);
						} else {
							setHistoryPage(row.original.feedId, 0);
						}
						row.toggleExpanded();
					},
					'aria-label': 'Toggle row expansion',
					'aria-expanded': row.getIsExpanded()
				});
			}
		},
		{
			id: 'select',
			header: ({ table }) =>
				renderComponent(DataTableCheckbox, {
					checked: table.getIsAllPageRowsSelected(),
					indeterminate: table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected(),
					onCheckedChange: (value: boolean) => table.toggleAllPageRowsSelected(!!value),
					'aria-label': 'Select all'
				}),
			cell: ({ row }) =>
				renderComponent(DataTableCheckbox, {
					checked: row.getIsSelected(),
					onCheckedChange: (value: boolean) => row.toggleSelected(!!value),
					'aria-label': 'Select row'
				}),
			enableSorting: false,
			enableHiding: false
		},
		{
			accessorKey: 'feedId',
			header: ({ column }) =>
				renderComponent(DataTableSortButton, {
					name: 'Feed ID',
					onclick: () => column.toggleSorting(column.getIsSorted() === 'asc'),
					class: 'justify-start'
				}),
			cell: ({ row }) => {
				const cellSnippet = createRawSnippet(() => ({
					render: () => `<div class="font-medium">${row.original.feedId}</div>`
				}));
				return renderSnippet(cellSnippet);
			},
			enableSorting: true
		},
		{
			accessorKey: 'price',
			header: ({ column }) =>
				renderComponent(DataTableSortButton, {
					name: 'Price',
					onclick: () => column.toggleSorting(column.getIsSorted() === 'asc')
				}),
			cell: ({ row }) =>
				renderComponent(FeedPriceDisplay, {
					value: row.getValue('price') as number | undefined,
					feedId: row.original.feedId,
					published: row.original.isPublished
				}),
			enableSorting: true,
			sortingFn: 'alphanumeric'
		},
		{
			accessorKey: 'lastUpdated',
			header: ({ column }) =>
				renderComponent(DataTableSortButton, {
					name: 'Last Updated',
					onclick: () => column.toggleSorting(column.getIsSorted() === 'asc')
				}),
			cell: ({ row }) => {
				const priceDate = row.original.lastUpdated;
				const formatted = priceDate
					? new Date(priceDate).toLocaleString('en-US', {
							year: 'numeric',
							month: 'short',
							day: 'numeric',
							hour: '2-digit',
							minute: '2-digit'
						})
					: '—';
				const cellSnippet = createRawSnippet(() => ({
					render: () => `<div class="text-sm">${formatted}</div>`
				}));
				return renderSnippet(cellSnippet);
			},
			enableSorting: true,
			sortingFn: (rowA, rowB) => {
				const dateA = rowA.original.lastUpdated;
				const dateB = rowB.original.lastUpdated;
				return (dateA?.getTime() ?? 0) - (dateB?.getTime() ?? 0);
			}
		},
		{
			id: 'actions',
			header: '',
			enableHiding: false,
			cell: ({ row }) =>
				renderComponent(FeedActions, {
					feedId: row.original.feedId,
					isUpdating: row.original.isUpdating,
					isPublishing: row.original.isPublishing,
					onUpdate: async (feedId: string) => {
						try {
							await odapi.updateFeedPrice(feedId);
							notify.success(`Fetched ${feedId}`);
							track('feed-fetch', { feed: feedId });
							if (!firstFetchTracked) {
								track('onboarding-step', { step: 'first-fetch' });
								firstFetchTracked = true;
							}
						} catch (err) {
							notify.error(getErrorMessage(err, 'Failed to fetch price'));
						}
					},
					onPublish: async (feedId: string) => {
						try {
							await odapi.publishFeedPrice(feedId);
							notify.success(`Published ${feedId}`);
							track('feed-publish', { feed: feedId });
						} catch (err) {
							notify.error(getErrorMessage(err, 'Failed to publish'));
						}
					}
				})
		}
	];

	// Table state
	let sorting = $state<SortingState>([]);
	let columnFilters = $state<ColumnFiltersState>([]);
	let rowSelection = $state<RowSelectionState>({});
	let expanded = $state<ExpandedState>({});

	// History pagination state
	let historyPageMap = new SvelteMap<string, number>();
	const HISTORY_PAGE_SIZE = 5;

	function getHistoryPage(feedId: string): number {
		return historyPageMap.get(feedId) ?? 0;
	}

	function setHistoryPage(feedId: string, page: number) {
		historyPageMap.set(feedId, page);
	}

	const table = createSvelteTable({
		get data() {
			return data;
		},
		columns,
		getRowId: (row) => row.feedId,
		state: {
			get sorting() {
				return sorting;
			},
			get columnFilters() {
				return columnFilters;
			},
			get rowSelection() {
				return rowSelection;
			},
			get expanded() {
				return expanded;
			}
		},
		getCoreRowModel: getCoreRowModel(),
		getExpandedRowModel: getExpandedRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		getRowCanExpand: (row) => odapi.hasExpandableHistory(row.original.feedId),
		onSortingChange: (updater) => {
			if (typeof updater === 'function') {
				sorting = updater(sorting);
			} else {
				sorting = updater;
			}
		},
		onColumnFiltersChange: (updater) => {
			if (typeof updater === 'function') {
				columnFilters = updater(columnFilters);
			} else {
				columnFilters = updater;
			}
		},
		onRowSelectionChange: (updater) => {
			if (typeof updater === 'function') {
				rowSelection = updater(rowSelection);
			} else {
				rowSelection = updater;
			}
		},
		onExpandedChange: (updater) => {
			if (typeof updater === 'function') {
				expanded = updater(expanded);
			} else {
				expanded = updater;
			}
		}
	});

	const filteredTotal = $derived(table.getFilteredRowModel().rows.length);

	// Sync selection count into ODAPI for derived affordability checks
	const selectedCount = $derived(table.getFilteredSelectedRowModel().rows.length);
	$effect(() => {
		odapi.selectedCount = selectedCount;
	});

	async function handleBulkUpdate() {
		const selectedFeedIds = table.getFilteredSelectedRowModel().rows.map((r) => r.original.feedId);
		rowSelection = {};
		isBulkUpdating = true;
		try {
			await odapi.updateMultipleFeedPrices(selectedFeedIds);
			notify.success(`Fetched ${selectedFeedIds.length} feed(s)`);
			track('feed-fetch-bulk', {
				count: selectedFeedIds.length,
				feeds: selectedFeedIds.join(', ')
			});
		} catch (err) {
			notify.error(getErrorMessage(err, 'Failed to fetch feeds'));
		} finally {
			isBulkUpdating = false;
		}
	}

	async function handleBulkPublish() {
		const selectedFeedIds = table.getFilteredSelectedRowModel().rows.map((r) => r.original.feedId);
		rowSelection = {};
		isBulkPublishing = true;
		try {
			await odapi.publishMultipleFeedPrices(selectedFeedIds);
			notify.success(`Published ${selectedFeedIds.length} feed(s)`);
			track('feed-publish-bulk', {
				count: selectedFeedIds.length,
				feeds: selectedFeedIds.join(', ')
			});
		} catch (err) {
			notify.error(getErrorMessage(err, 'Failed to publish feeds'));
		} finally {
			isBulkPublishing = false;
		}
	}
</script>

<div class="w-full">
	<h1 class="text-xl font-bold">Orcfax Data Feeds</h1>
	<div class="bg-card mt-4 rounded-lg border p-7">
		<div class="flex items-center gap-2">
			<Input
				placeholder="Filter feeds..."
				value={table.getColumn('feedId')?.getFilterValue() as string}
				oninput={(event) => {
					table.getColumn('feedId')?.setFilterValue(event.currentTarget.value);
				}}
				class="max-w-3xs"
			/>
			{#if selectedCount > 0 || isBulkUpdating || isBulkPublishing}
				<span class="text-sm font-medium whitespace-nowrap">
					{#if isBulkUpdating}
						Fetching...
					{:else if isBulkPublishing}
						Publishing...
					{:else}
						{selectedCount} selected
					{/if}
				</span>
				<Button
					variant="outline"
					size="sm"
					disabled={!odapi.canAffordUpdates || isBulkUpdating || isBulkPublishing}
					onclick={handleBulkUpdate}
				>
					<span class="grid grid-cols-1 grid-rows-1 place-items-center">
						<span
							class="col-start-1 row-start-1 inline-flex items-center gap-1"
							class:invisible={isBulkUpdating}
						>
							<RefreshCcwDotIcon class="h-3.5 w-3.5" />
							Fetch Selected
						</span>
						{#if isBulkUpdating}
							<Spinner class="col-start-1 row-start-1 h-4 w-4" />
						{/if}
					</span>
				</Button>
				<Button
					variant="default"
					size="sm"
					disabled={!odapi.canAffordPublishes || isBulkPublishing || isBulkUpdating}
					onclick={handleBulkPublish}
				>
					<span class="grid grid-cols-1 grid-rows-1 place-items-center">
						<span
							class="col-start-1 row-start-1 inline-flex items-center gap-1"
							class:invisible={isBulkPublishing}
						>
							<PackagePlus class="h-3.5 w-3.5" />
							Publish Selected
						</span>
						{#if isBulkPublishing}
							<Spinner class="col-start-1 row-start-1 h-4 w-4" />
						{/if}
					</span>
				</Button>
				{#if !isBulkUpdating && !isBulkPublishing}
					<Button variant="ghost" size="sm" onclick={() => (rowSelection = {})}>Clear</Button>
				{/if}
			{/if}
		</div>
		<p class="text-muted-foreground pt-1 pb-4 text-xs">
			Showing {filteredTotal} feed{filteredTotal === 1 ? '' : 's'}
		</p>
		<Table.Root>
			<Table.Header>
				{#each table.getHeaderGroups() as headerGroup (headerGroup.id)}
					<Table.Row>
						{#each headerGroup.headers as header (header.id)}
							<Table.Head class="px-0 [&:has([role=checkbox])]:pl-3">
								{#if !header.isPlaceholder}
									<FlexRender
										content={header.column.columnDef.header}
										context={header.getContext()}
									/>
								{/if}
							</Table.Head>
						{/each}
					</Table.Row>
				{/each}
			</Table.Header>
			<Table.Body>
				{#if loading}
					{#each { length: 20 }, i (i)}
						<Table.Row>
							<Table.Cell class="w-8 px-2">
								<Skeleton class="h-8 w-8 rounded" />
							</Table.Cell>
							<Table.Cell class="pl-3">
								<Skeleton class="h-4 w-4 rounded" />
							</Table.Cell>
							<Table.Cell>
								<Skeleton class="h-4 w-32" />
							</Table.Cell>
							<Table.Cell>
								<Skeleton class="h-4 w-20" />
							</Table.Cell>
							<Table.Cell>
								<Skeleton class="h-4 w-36" />
							</Table.Cell>
							<Table.Cell>
								<Skeleton class="h-8 w-16 rounded" />
							</Table.Cell>
						</Table.Row>
					{/each}
				{:else if errorMessage}
					<Table.Row>
						<Table.Cell colspan={columns.length} class="h-24 text-center">
							<div class="flex flex-col items-center gap-2">
								<p class="text-destructive text-sm">{errorMessage}</p>
								<Button variant="outline" size="sm" onclick={() => odapi.initialize()}>
									Retry
								</Button>
							</div>
						</Table.Cell>
					</Table.Row>
				{:else if data.length > 0}
					{#each table.getRowModel().rows as row (row.id)}
						<Table.Row data-state={row.getIsSelected() && 'selected'}>
							{#each row.getVisibleCells() as cell (cell.id)}
								<Table.Cell class="[&:has([role=checkbox])]:pl-3">
									<FlexRender content={cell.column.columnDef.cell} context={cell.getContext()} />
								</Table.Cell>
							{/each}
						</Table.Row>
						{@const allHistory = (feedHistory.get(row.original.feedId) ?? []).slice(1)}
						{#if row.getIsExpanded() && allHistory.length > 0}
							{@const historyPage = getHistoryPage(row.original.feedId)}
							{@const historyStart = historyPage * HISTORY_PAGE_SIZE}
							{@const pagedHistory = allHistory.slice(
								historyStart,
								historyStart + HISTORY_PAGE_SIZE
							)}
							{@const historyPageCount = Math.ceil(allHistory.length / HISTORY_PAGE_SIZE)}
							{#each pagedHistory as update (update.id)}
								<Table.Row class="bg-muted/30">
									<Table.Cell class="w-8"></Table.Cell>
									<Table.Cell class="[&:has([role=checkbox])]:pl-3"></Table.Cell>
									<Table.Cell class="text-muted-foreground text-sm"></Table.Cell>
									<Table.Cell>
										<FeedPriceDisplay
											value={parseFloat(update.value)}
											feedId={row.original.feedId}
											published={update.published ?? false}
										/>
									</Table.Cell>
									<Table.Cell>
										<div class="text-sm">
											{odapi.formatTimestamp(update.timestamp)}
										</div>
									</Table.Cell>
									<Table.Cell></Table.Cell>
								</Table.Row>
							{/each}
							{#if historyPageCount > 1}
								<Table.Row class="bg-muted/30">
									<Table.Cell colspan={columns.length}>
										<div class="flex items-center justify-center gap-2 py-1">
											<Button
												variant="ghost"
												size="sm"
												class="h-6 w-6 p-0"
												disabled={historyPage === 0}
												onclick={() => setHistoryPage(row.original.feedId, historyPage - 1)}
											>
												<ChevronLeftIcon class="h-3.5 w-3.5" />
											</Button>
											<span class="text-muted-foreground text-xs">
												{historyPage + 1} / {historyPageCount}
											</span>
											<Button
												variant="ghost"
												size="sm"
												class="h-6 w-6 p-0"
												disabled={historyPage >= historyPageCount - 1}
												onclick={() => setHistoryPage(row.original.feedId, historyPage + 1)}
											>
												<ChevronRightIcon class="h-3.5 w-3.5" />
											</Button>
										</div>
									</Table.Cell>
								</Table.Row>
							{/if}
						{/if}
					{/each}
				{:else}
					<Table.Row>
						<Table.Cell colspan={columns.length} class="h-24 text-center">No results.</Table.Cell>
					</Table.Row>
				{/if}
			</Table.Body>
		</Table.Root>
	</div>
</div>
