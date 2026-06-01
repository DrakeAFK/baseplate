<script lang="ts">
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
		reindexMessage = 'Workspace reindexed. Search and backlinks were rebuilt.';
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
						{reindexState === 'working' ? 'Reindexing...' : 'Reindex workspace'}
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
	</div>
</div>
