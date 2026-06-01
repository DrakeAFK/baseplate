<script lang="ts">
	import { goto } from '$app/navigation';
	import { tick } from 'svelte';
	import { cn } from '$lib/utils/cn';

	let {
		open = false,
		items = [],
		onClose = () => {},
		onAction = (_action: string) => {}
	}: {
		open?: boolean;
		items: Array<{ id: string; group: string; label: string; href: string | null; action: string | null }>;
		onClose?: () => void;
		onAction?: (action: string) => void;
	} = $props();

	let query = $state('');
	let activeIndex = $state(0);
	let inputEl = $state<HTMLInputElement | null>(null);
	let filtered = $derived(
		items.filter((item) => item.label.toLowerCase().includes(query.toLowerCase()) || item.group.toLowerCase().includes(query.toLowerCase()))
	);

	$effect(() => {
		if (!open) return;
		query = '';
		activeIndex = 0;
		void tick().then(() => inputEl?.focus());
	});

	$effect(() => {
		if (activeIndex >= filtered.length) {
			activeIndex = Math.max(0, filtered.length - 1);
		}
	});

	function activate(item: (typeof items)[number]): void {
		if (item.href) goto(item.href);
		if (item.action) onAction(item.action);
		onClose();
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			activeIndex = filtered.length ? (activeIndex + 1) % filtered.length : 0;
		}
		if (event.key === 'ArrowUp') {
			event.preventDefault();
			activeIndex = filtered.length ? (activeIndex - 1 + filtered.length) % filtered.length : 0;
		}
		if (event.key === 'Enter') {
			event.preventDefault();
			const item = filtered[activeIndex] ?? filtered[0];
			if (item) activate(item);
		}
	}
</script>

{#if open}
	<div
		class="fixed inset-0 z-50 bg-[rgba(1,4,9,0.8)] p-4 backdrop-blur-sm"
		role="button"
		tabindex="0"
		onclick={onClose}
		onkeydown={(event) => event.key === 'Escape' && onClose()}
	>
		<div class="bp-panel mx-auto mt-12 max-w-2xl overflow-hidden" role="presentation" onclick={(event) => event.stopPropagation()}>
			<div class="grid gap-3 border-b border-[var(--bp-border)] bg-[#010409] p-3">
				<div class="flex items-center justify-between gap-3">
					<p class="bp-kicker">Command</p>
					<kbd class="kbd">esc</kbd>
				</div>
				<div class="border border-[var(--bp-border)] bg-[var(--bp-bg)] px-3 py-2">
					<input
						bind:this={inputEl}
						class="input input-ghost h-10 w-full border-none bg-transparent px-0 text-base shadow-none focus:shadow-none"
						bind:value={query}
						onkeydown={handleKeydown}
						placeholder="Type a command or destination"
					/>
				</div>
			</div>
			<div class="max-h-[28rem] overflow-y-auto p-1">
				{#each filtered as item, index (item.id)}
					<button
						class={cn(
							'grid w-full grid-cols-[minmax(0,1fr)_7rem] items-center gap-3 rounded-[0.25rem] px-3 py-2 text-left transition hover:bg-white/10',
							index === activeIndex && 'bg-white/10'
						)}
						onmouseenter={() => (activeIndex = index)}
						onclick={() => activate(item)}
					>
						<span class="truncate font-medium text-white">{item.label}</span>
						<span class="bp-meta text-right">{item.group}</span>
					</button>
				{/each}
				{#if !filtered.length}
					<p class="bp-empty m-2 px-4 py-8 text-sm">No matches.</p>
				{/if}
			</div>
		</div>
	</div>
{/if}
