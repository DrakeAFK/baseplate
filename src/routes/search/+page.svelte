<script lang="ts">
	import type { PageData } from './$types';
	import { formatRelative } from '$lib/utils/dates';

	let { data }: { data: PageData } = $props();
	let q = $state('');
	let type = $state<'all' | 'project' | 'task' | 'note' | 'meeting'>('all');
	let projectId = $state('');
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

	async function search() {
		const params = new URLSearchParams({ q, type });
		if (projectId) params.set('projectId', projectId);
		const response = await fetch(`/api/search?${params.toString()}`);
		const payload = await response.json();
		results = payload.results ?? [];
	}
</script>

<div class="bp-page">
	<section class="bp-hero p-6 md:p-7">
		<div class="bp-toolbar">
			<div>
				<p class="bp-kicker">Search</p>
				<h1 class="bp-page-title">Search</h1>
				<p class="bp-copy">Projects, tasks, notes, and meetings across the workspace.</p>
			</div>
			<span class="bp-pill">{results.length} results</span>
		</div>
	</section>

	<section class="bp-panel p-5">
		<div class="relative z-10 grid gap-4 lg:grid-cols-[minmax(0,1fr)_12rem_14rem_auto]">
			<input class="input input-bordered" bind:value={q} oninput={search} placeholder="Search projects, tasks, notes, and meetings" />
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
			<button class="btn btn-primary" onclick={search}>Search</button>
		</div>
	</section>

	<div class="grid gap-3">
		{#if results.length}
			{#each results as result}
				<a class="bp-list-card px-5 py-4" href={result.href ?? '/search'}>
					<div class="flex flex-wrap items-center justify-between gap-3">
						<div>
							<p class="font-medium text-white">{result.title}</p>
							<p class="mt-1 text-sm text-base-content/60">{result.object_type} · {result.project_title || 'Global'}</p>
						</div>
						<p class="bp-meta">{formatRelative(result.updated_at)}</p>
					</div>
					<p class="mt-3 text-sm text-base-content/55">{result.body.slice(0, 220)}</p>
				</a>
			{/each}
		{:else}
			<div class="bp-empty p-10 text-center">
				{q.trim() ? 'No results matched this query.' : 'Search project names, task titles, note bodies, and meeting notes.'}
			</div>
		{/if}
	</div>
</div>
