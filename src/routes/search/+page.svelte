<script lang="ts">
	import type { PageData } from './$types';
	import { formatRelative } from '$lib/utils/dates';
	import { onDestroy } from 'svelte';

	let { data }: { data: PageData } = $props();
	let q = $state('');
	let type = $state<'all' | 'project' | 'task' | 'note' | 'meeting'>('all');
	let projectId = $state('');
	let loading = $state(false);
	let error = $state('');
	let timer: ReturnType<typeof setTimeout> | null = null;
	let searchRun = 0;
	let results = $state<
		Array<{
			object_type: string;
			object_id: string;
			title: string;
			body: string;
			project_title: string;
			updated_at: string;
			project_slug: string | null;
			href: string | null;
		}>
	>([]);

	function scheduleSearch(): void {
		if (timer) clearTimeout(timer);
		if (!q.trim()) {
			results = [];
			loading = false;
			error = '';
			return;
		}
		timer = setTimeout(() => void search(), 180);
	}

	async function search() {
		if (!q.trim()) {
			results = [];
			return;
		}
		const run = ++searchRun;
		loading = true;
		error = '';
		const params = new URLSearchParams({ q, type });
		if (projectId) params.set('projectId', projectId);
		try {
			const response = await fetch(`/api/search?${params.toString()}`);
			const payload = await response.json();
			if (run !== searchRun) return;
			if (!response.ok) {
				error = payload?.error ?? 'Search failed';
				results = [];
				return;
			}
			results = payload.results ?? [];
		} catch {
			if (run !== searchRun) return;
			error = 'Search failed';
			results = [];
		} finally {
			if (run === searchRun) loading = false;
		}
	}

	onDestroy(() => {
		if (timer) clearTimeout(timer);
	});
</script>

<div class="bp-page">
	<section class="bp-hero pb-4">
		<div class="bp-toolbar">
			<div>
				<p class="bp-kicker">Search</p>
				<h1 class="bp-page-title">Search</h1>
			</div>
			<span class="bp-pill">{loading ? 'Searching' : `${results.length} results`}</span>
		</div>
	</section>

	<section class="bp-panel p-3">
		<div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_12rem_14rem_auto]">
			<input class="input input-bordered" bind:value={q} oninput={scheduleSearch} placeholder="Search projects, tasks, notes, meetings" />
			<select class="select select-bordered" bind:value={type} onchange={search}>
				<option value="all">All types</option>
				<option value="project">Projects</option>
				<option value="task">Tasks</option>
				<option value="note">Notes</option>
				<option value="meeting">Meetings</option>
			</select>
			<select class="select select-bordered" bind:value={projectId} onchange={search}>
				<option value="">All projects</option>
				{#each data.projects as project}
					<option value={project.id}>{project.title}</option>
				{/each}
			</select>
			<button class="btn btn-primary" onclick={search} disabled={!q.trim() || loading}>{loading ? 'Searching...' : 'Search'}</button>
		</div>
		{#if error}
			<p class="mt-3 text-sm text-error">{error}</p>
		{/if}
	</section>

	<section class="bp-panel overflow-hidden">
		{#if results.length}
			<table class="bp-data-table">
				<thead>
					<tr>
						<th class="w-[44%]">Result</th>
						<th>Type</th>
						<th>Project</th>
						<th>Updated</th>
					</tr>
				</thead>
				<tbody>
					{#each results as result}
						<tr>
							<td>
								<a class="block min-w-0" href={result.href ?? '/search'}>
									<p class="truncate font-medium text-white">{result.title}</p>
									<p class="mt-1 line-clamp-2 text-sm text-base-content/55">{result.body.slice(0, 220)}</p>
								</a>
							</td>
							<td><span class="badge badge-ghost">{result.object_type}</span></td>
							<td><p class="truncate text-sm text-base-content/65">{result.project_title || 'Global'}</p></td>
							<td><p class="bp-meta">{formatRelative(result.updated_at)}</p></td>
						</tr>
					{/each}
				</tbody>
			</table>
		{:else}
			<div class="bp-empty m-4 p-10 text-center">
				{q.trim() ? 'No results matched this query.' : 'Search project names, task titles, note bodies, and meeting notes.'}
			</div>
		{/if}
	</section>
</div>
