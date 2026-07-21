<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let reindexState = $state<'idle' | 'working' | 'success' | 'error'>('idle');
	let reindexMessage = $state('');
	let lastReindexedAt = $state('');

	async function reindex(): Promise<void> {
		reindexState = 'working';
		reindexMessage = '';
		const response = await fetch('/api/reindex', { method: 'POST' });
		if (!response.ok) {
			reindexState = 'error';
			reindexMessage = 'Workspace reindex failed. Check the server logs.';
			return;
		}
		reindexState = 'success';
		lastReindexedAt = new Date().toLocaleString();
		reindexMessage = 'Workspace rebuilt from canonical files. Search and backlinks were refreshed.';
	}

	async function restore(url: string): Promise<void> {
		const response = await fetch(url, { method: 'POST' });
		if (!response.ok) { reindexState = 'error'; reindexMessage = 'Restore failed.'; return; }
		await invalidateAll();
	}
</script>

<div class="bp-page max-w-6xl">
	<section class="bp-hero pb-4">
		<div>
			<p class="bp-kicker">Settings</p>
			<h1 class="bp-page-title">Settings</h1>
		</div>
	</section>

	<div class="bp-stat-grid md:grid-cols-4">
		<div class="bp-stat">
			<p class="bp-meta">Projects</p>
			<p class="bp-stat-value">{data.snapshot.projectCount}</p>
		</div>
		<div class="bp-stat">
			<p class="bp-meta">Open tasks</p>
			<p class="bp-stat-value">{data.snapshot.openTaskCount}</p>
		</div>
		<div class="bp-stat">
			<p class="bp-meta">Notes</p>
			<p class="bp-stat-value">{data.snapshot.noteCount}</p>
		</div>
		<div class="bp-stat">
			<p class="bp-meta">Meetings</p>
			<p class="bp-stat-value">{data.snapshot.meetingCount}</p>
		</div>
	</div>

	<div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
		<section class="bp-panel p-4">
			<div class="grid gap-5">
				<div>
					<p class="bp-meta">Workspace path</p>
					<p class="mt-2 font-mono text-sm text-white">{data.workspaceDir}</p>
				</div>
				<div>
					<p class="bp-meta">Database status</p>
					<p class="mt-2 text-white">{data.databaseStatus}</p>
				</div>
				<div class="grid gap-3 sm:grid-cols-3">
					<div class="bp-panel-soft p-3"><p class="bp-meta">Missing files</p><p class="mt-2 font-mono text-lg text-white">{data.missingFiles}</p></div>
					<div class="bp-panel-soft p-3"><p class="bp-meta">Task files</p><p class="mt-2 font-mono text-lg text-white">{data.canonicalTaskFiles}</p></div>
					<div class="bp-panel-soft p-3"><p class="bp-meta">History</p><p class="mt-2 font-mono text-lg text-white">{data.historySnapshots}</p></div>
				</div>
				<div>
					<p class="bp-meta">App info</p>
					<p class="mt-2 text-white">{data.appInfo}</p>
				</div>
			</div>
		</section>

		<section class="bp-panel p-4">
			<div>
				<h2 class="bp-section-title">Search maintenance</h2>
				<div class="mt-4 grid gap-3">
					<button class="btn btn-primary" onclick={reindex} disabled={reindexState === 'working'}>
						{reindexState === 'working' ? 'Rebuilding...' : 'Rebuild from files'}
					</button>
					{#if reindexMessage}
						<p class={`text-sm ${reindexState === 'error' ? 'text-error' : 'text-success'}`}>{reindexMessage}</p>
					{/if}
					{#if lastReindexedAt}
						<p class="bp-meta">Last reindexed {lastReindexedAt}</p>
					{/if}
				</div>
			</div>
		</section>
		<section class="bp-panel p-4 lg:col-span-2">
			<h2 class="bp-section-title">Keyboard</h2>
			<div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<p class="text-sm text-base-content/70"><kbd class="kbd">Ctrl K</kbd> command palette</p>
				<p class="text-sm text-base-content/70"><kbd class="kbd">G W</kbd> Workbench</p>
				<p class="text-sm text-base-content/70"><kbd class="kbd">G T</kbd> Today</p>
				<p class="text-sm text-base-content/70"><kbd class="kbd">T</kbd> create task</p>
			</div>
		</section>
		{#if data.archivedItems.length}
			<details class="bp-panel p-4 lg:col-span-2">
				<summary class="cursor-pointer font-semibold text-white">Recovery bin ({data.archivedItems.length})</summary>
				<div class="bp-list mt-4">
					{#each data.archivedItems as item (item.id)}
						<div class="bp-list-row flex items-center justify-between gap-3">
							<div class="min-w-0"><p class="truncate text-sm text-white">{item.title}</p><p class="bp-meta mt-1">{item.type} / {item.context}</p></div>
							<button class="btn btn-ghost btn-xs" onclick={() => restore(item.restoreUrl)}>Restore</button>
						</div>
					{/each}
				</div>
			</details>
		{/if}
	</div>
</div>
