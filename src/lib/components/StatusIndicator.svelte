<script lang="ts">
	interface Props {
		color: 'green' | 'yellow' | 'red';
		size?: 'sm' | 'md';
	}

	let { color, size = 'sm' }: Props = $props();
</script>

<span class={`relative flex ${size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5'}`}>
	<span
		class="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
		class:bg-green-400={color === 'green'}
		class:bg-yellow-400={color === 'yellow'}
		class:bg-red-400={color === 'red'}
	>
	</span>
	<span
		class={`relative inline-flex rounded-full ${size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5'}`}
		class:bg-green-500={color === 'green'}
		class:bg-yellow-500={color === 'yellow'}
		class:bg-red-500={color === 'red'}
	>
	</span>
</span>
