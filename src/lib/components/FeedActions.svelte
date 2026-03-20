<script lang="ts">
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import RefreshCcwDotIcon from '@lucide/svelte/icons/refresh-ccw-dot';
	import PackagePlus from '@lucide/svelte/icons/package-plus';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { getODAPIState } from '$lib/odapi/odapi.svelte';

	type Props = {
		feedId: string;
		isUpdating: boolean;
		isPublishing: boolean;
		onUpdate: (feedId: string) => void | Promise<void>;
		onPublish: (feedId: string) => void | Promise<void>;
	};

	let { feedId, isUpdating, isPublishing, onUpdate, onPublish }: Props = $props();

	const odapi = getODAPIState();
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="ghost" size="icon" class="relative size-8 p-0">
				<span class="sr-only">Open menu</span>
				<EllipsisIcon />
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end">
		<DropdownMenu.Group>
			<DropdownMenu.GroupHeading>Actions</DropdownMenu.GroupHeading>
			<DropdownMenu.Item
				disabled={isUpdating || isPublishing || !odapi.canUpdate}
				onclick={() => onUpdate(feedId)}
			>
				<RefreshCcwDotIcon class="mr-2 h-4 w-4" />
				Fetch
			</DropdownMenu.Item>
			<DropdownMenu.Item
				disabled={isPublishing || isUpdating || !odapi.canPublish}
				onclick={() => onPublish(feedId)}
			>
				<PackagePlus class="mr-2 h-4 w-4" />
				Publish
			</DropdownMenu.Item>
		</DropdownMenu.Group>
	</DropdownMenu.Content>
</DropdownMenu.Root>
