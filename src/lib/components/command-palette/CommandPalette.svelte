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
	<div class="fixed inset-0 z-50 bg-neutral/55 p-4 backdrop-blur-sm" role="button" tabindex="0" onclick={onClose} onkeydown={(event) => event.key === 'Escape' && onClose()}>
		<div class="mx-auto mt-16 max-w-2xl rounded-[1.8rem] border border-white/10 bg-base-100/95 shadow-[0_30px_120px_rgba(0,0,0,0.45)]" role="presentation" onclick={(event) => event.stopPropagation()}>
			<div class="border-b border-white/10 px-5 py-4">
				<input
					bind:this={inputEl}
					class="input input-ghost w-full text-base"
					bind:value={query}
					onkeydown={handleKeydown}
					placeholder="Search commands, recent items, and navigation"
				/>
			</div>
			<div class="max-h-[28rem] overflow-y-auto p-3">
				{#each filtered as item, index (item.id)}
					<button
						class={cn(
							'flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left transition hover:bg-base-200',
							index === activeIndex && 'bg-base-200'
						)}
						onmouseenter={() => (activeIndex = index)}
						onclick={() => activate(item)}
					>
						<span class="font-medium">{item.label}</span>
						<span class="text-xs uppercase tracking-[0.25em] text-base-content/45">{item.group}</span>
					</button>
				{/each}
				{#if !filtered.length}
					<p class="px-4 py-8 text-sm text-base-content/55">No commands matched.</p>
				{/if}
			</div>
		</div>
	</div>
{/if}
