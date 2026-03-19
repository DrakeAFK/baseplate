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
		class="fixed inset-0 z-50 bg-[rgba(2,7,14,0.76)] p-4 backdrop-blur-md"
		role="button"
		tabindex="0"
		onclick={onClose}
		onkeydown={(event) => event.key === 'Escape' && onClose()}
	>
		<div class="bp-panel mx-auto mt-12 max-w-2xl p-4" role="presentation" onclick={(event) => event.stopPropagation()}>
			<div class="relative z-10 grid gap-4">
				<div class="px-2 pt-1">
					<p class="bp-kicker">Command palette</p>
					<p class="mt-2 text-sm text-base-content/55">Navigate, open recent work, or trigger a quick create action.</p>
				</div>
				<div class="rounded-[1.35rem] border border-white/10 bg-black/10 px-4 py-3">
					<input
						bind:this={inputEl}
						class="input input-ghost h-12 w-full border-none bg-transparent px-0 text-base shadow-none focus:shadow-none"
						bind:value={query}
						onkeydown={handleKeydown}
						placeholder="Search navigation, actions, and recent items"
					/>
				</div>
			</div>
			<div class="relative z-10 mt-4 max-h-[28rem] overflow-y-auto p-1">
				{#each filtered as item, index (item.id)}
					<button
						class={cn(
							'flex w-full items-center justify-between rounded-[1.2rem] px-4 py-3 text-left transition hover:bg-white/10',
							index === activeIndex && 'bg-white/10'
						)}
						onmouseenter={() => (activeIndex = index)}
						onclick={() => activate(item)}
					>
						<span class="font-medium text-white">{item.label}</span>
						<span class="bp-meta">{item.group}</span>
					</button>
				{/each}
				{#if !filtered.length}
					<p class="bp-empty px-4 py-8 text-sm">No results matched.</p>
				{/if}
			</div>
		</div>
	</div>
{/if}
