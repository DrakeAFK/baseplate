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

<div class="grid max-w-5xl gap-6">
	<section class="rounded-[2rem] border border-white/10 bg-base-200/50 p-6">
		<p class="text-xs uppercase tracking-[0.3em] text-base-content/45">Settings</p>
		<h1 class="mt-2 text-4xl font-semibold text-white">Workspace maintenance</h1>
		<p class="mt-3 max-w-3xl text-base-content/65">
			This page is for operational state: where your workspace lives, whether the database is healthy, and the maintenance actions that affect indexing.
		</p>
	</section>

	<div class="grid gap-4 md:grid-cols-4">
		<div class="rounded-[1.6rem] border border-white/10 bg-base-200/45 p-5">
			<p class="text-xs uppercase tracking-[0.24em] text-base-content/45">Projects</p>
			<p class="mt-2 text-3xl font-semibold text-white">{data.snapshot.projectCount}</p>
		</div>
		<div class="rounded-[1.6rem] border border-white/10 bg-base-200/45 p-5">
			<p class="text-xs uppercase tracking-[0.24em] text-base-content/45">Open tasks</p>
			<p class="mt-2 text-3xl font-semibold text-white">{data.snapshot.openTaskCount}</p>
		</div>
		<div class="rounded-[1.6rem] border border-white/10 bg-base-200/45 p-5">
			<p class="text-xs uppercase tracking-[0.24em] text-base-content/45">Notes</p>
			<p class="mt-2 text-3xl font-semibold text-white">{data.snapshot.noteCount}</p>
		</div>
		<div class="rounded-[1.6rem] border border-white/10 bg-base-200/45 p-5">
			<p class="text-xs uppercase tracking-[0.24em] text-base-content/45">Meetings</p>
			<p class="mt-2 text-3xl font-semibold text-white">{data.snapshot.meetingCount}</p>
		</div>
	</div>

	<div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
		<div class="rounded-[1.8rem] border border-white/10 bg-base-200/45 p-5">
			<div class="grid gap-5">
				<div>
					<p class="text-sm text-base-content/60">Workspace path</p>
					<p class="mt-1 font-mono text-sm text-white">{data.workspaceDir}</p>
				</div>
				<div>
					<p class="text-sm text-base-content/60">Database status</p>
					<p class="mt-1 text-white">{data.databaseStatus}</p>
				</div>
				<div>
					<p class="text-sm text-base-content/60">App info</p>
					<p class="mt-1 text-white">{data.appInfo}</p>
				</div>
			</div>
		</div>

		<div class="rounded-[1.8rem] border border-white/10 bg-base-200/45 p-5">
			<h2 class="text-xl font-semibold text-white">Search maintenance</h2>
			<p class="mt-2 text-sm text-base-content/60">
				Use reindex when you suspect search, backlinks, or file-system changes need a fresh scan.
			</p>
			<div class="mt-5 grid gap-3">
				<button class="btn btn-primary" onclick={reindex} disabled={reindexState === 'working'}>
					{reindexState === 'working' ? 'Reindexing…' : 'Reindex workspace'}
				</button>
				{#if reindexMessage}
					<p class={`text-sm ${reindexState === 'error' ? 'text-error' : 'text-success'}`}>{reindexMessage}</p>
				{/if}
				{#if lastReindexedAt}
					<p class="text-xs text-base-content/45">Last reindexed {lastReindexedAt}</p>
				{/if}
			</div>
		</div>
	</div>
</div>
