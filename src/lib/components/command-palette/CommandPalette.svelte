<script lang="ts">
	import { goto } from '$app/navigation';
	import { tick } from 'svelte';
	import { cn } from '$lib/utils/cn';

	let {
		open = false,
		items = [],
		onClose = () => {},
		onAction = (_action: string, _payload?: Record<string, string>) => {}
	}: {
		open?: boolean;
		items: Array<{ id: string; group: string; label: string; href: string | null; action: string | null; payload?: Record<string, string> }>;
		onClose?: () => void;
		onAction?: (action: string, payload?: Record<string, string>) => void;
	} = $props();

	let query = $state('');
	let activeIndex = $state(0);
	let inputEl = $state<HTMLInputElement | null>(null);
	let remoteItems = $state<typeof items>([]);
	let searchTimer: ReturnType<typeof setTimeout> | null = null;
	let searchRun = 0;
	let filtered = $derived(
		[
			...items.filter((item) => item.label.toLowerCase().includes(query.toLowerCase()) || item.group.toLowerCase().includes(query.toLowerCase())),
			...remoteItems,
			...(query.trim() ? [
				{ id: 'quick-task', group: 'Quick create', label: `Create task “${query.trim()}”`, href: null, action: 'quickCreateTask', payload: { title: query.trim() } },
				{ id: 'quick-capture', group: 'Capture', label: `Send “${query.trim()}” to Inbox`, href: null, action: 'captureInbox', payload: { text: query.trim() } }
			] : [])
		].filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index)
	);

	$effect(() => {
		if (searchTimer) clearTimeout(searchTimer);
		const value = query.trim();
		if (!open || value.length < 2) { remoteItems = []; return; }
		const run = ++searchRun;
		searchTimer = setTimeout(async () => {
			const response = await fetch(`/api/search?q=${encodeURIComponent(value)}`);
			const payload = await response.json().catch(() => null);
			if (run !== searchRun || !response.ok) return;
			remoteItems = (payload?.results ?? []).slice(0, 12).map((result: { object_type: string; object_id: string; title: string; href: string | null; project_title: string }) => ({
				id: `search-${result.object_type}-${result.object_id}`,
				group: result.project_title || result.object_type,
				label: result.title,
				href: result.href,
				action: null
			}));
		}, 120);
		return () => { if (searchTimer) clearTimeout(searchTimer); };
	});

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
		if (item.action) onAction(item.action, item.payload);
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
						placeholder="Find anything, create a task, or capture a thought"
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
