<script lang="ts">
	import { goto } from '$app/navigation';

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
	let filtered = $derived(
		items.filter((item) => item.label.toLowerCase().includes(query.toLowerCase()) || item.group.toLowerCase().includes(query.toLowerCase()))
	);

	function activate(item: (typeof items)[number]) {
		if (item.href) goto(item.href);
		if (item.action) onAction(item.action);
		onClose();
	}
</script>

{#if open}
	<div class="fixed inset-0 z-50 bg-neutral/55 p-4 backdrop-blur-sm" role="button" tabindex="0" onclick={onClose} onkeydown={(event) => event.key === 'Escape' && onClose()}>
		<div class="mx-auto mt-16 max-w-2xl rounded-[1.8rem] border border-white/10 bg-base-100/95 shadow-[0_30px_120px_rgba(0,0,0,0.45)]" role="presentation" onclick={(event) => event.stopPropagation()}>
			<div class="border-b border-white/10 px-5 py-4">
				<input class="input input-ghost w-full text-base" bind:value={query} placeholder="Search commands, recent items, and navigation" />
			</div>
			<div class="max-h-[28rem] overflow-y-auto p-3">
				{#each filtered as item (item.id)}
					<button class="flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left transition hover:bg-base-200" onclick={() => activate(item)}>
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
