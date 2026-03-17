<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { Project, ProjectStatus } from '$lib/types/models';
	import { formatRelative } from '$lib/utils/dates';
	import { moveItem, sortProjects, type ProjectSortMode } from '$lib/utils/projects';
	import { untrack } from 'svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const statuses: ProjectStatus[] = ['active', 'on_hold', 'completed', 'archived'];

	let projects = $state<Project[]>(untrack(() => data.projects));
	let sortMode = $state<ProjectSortMode>('manual');
	let dragProjectId = $state<string | null>(null);
	let dropProjectId = $state<string | null>(null);
	let savingOrder = $state(false);
	let orderError = $state('');

	const visibleProjects = $derived(sortProjects(projects, sortMode));

	$effect(() => {
		projects = data.projects;
	});

	function canMove(projectId: string, direction: -1 | 1): boolean {
		if (sortMode !== 'manual' || savingOrder) return false;
		const index = projects.findIndex((project) => project.id === projectId);
		const nextIndex = index + direction;
		return index >= 0 && nextIndex >= 0 && nextIndex < projects.length;
	}

	async function persistOrder(nextProjects: Project[]): Promise<void> {
		const previousProjects = projects;
		projects = nextProjects;
		savingOrder = true;
		orderError = '';

		const response = await fetch('/api/projects/reorder', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				status: data.status as ProjectStatus,
				projectIds: nextProjects.map((project) => project.id)
			})
		});
		const payload = await response.json().catch(() => null);

		savingOrder = false;
		dragProjectId = null;
		dropProjectId = null;

		if (!response.ok) {
			projects = previousProjects;
			orderError = payload?.error ?? 'Unable to save project order';
			return;
		}

		await invalidateAll();
	}

	async function moveProject(projectId: string, direction: -1 | 1): Promise<void> {
		if (!canMove(projectId, direction)) return;
		const index = projects.findIndex((project) => project.id === projectId);
		await persistOrder(moveItem(projects, index, index + direction));
	}

	function handleDragStart(event: DragEvent, projectId: string): void {
		if (sortMode !== 'manual' || savingOrder) {
			event.preventDefault();
			return;
		}

		dragProjectId = projectId;
		dropProjectId = projectId;
		event.dataTransfer?.setData('text/plain', projectId);
		event.dataTransfer?.setData('application/baseplate-project-id', projectId);
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
		}
	}

	function handleDragOver(event: DragEvent, projectId: string): void {
		if (sortMode !== 'manual' || savingOrder || !dragProjectId || dragProjectId === projectId) return;
		event.preventDefault();
		dropProjectId = projectId;
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = 'move';
		}
	}

	async function handleDrop(event: DragEvent, projectId: string): Promise<void> {
		event.preventDefault();
		if (sortMode !== 'manual' || savingOrder || !dragProjectId || dragProjectId === projectId) {
			dragProjectId = null;
			dropProjectId = null;
			return;
		}

		const fromIndex = projects.findIndex((project) => project.id === dragProjectId);
		const toIndex = projects.findIndex((project) => project.id === projectId);
		dragProjectId = null;
		dropProjectId = null;

		if (fromIndex < 0 || toIndex < 0) return;
		await persistOrder(moveItem(projects, fromIndex, toIndex));
	}

	function clearDragState(): void {
		dragProjectId = null;
		dropProjectId = null;
	}
</script>

<div class="grid gap-6">
	<section class="flex flex-wrap items-end justify-between gap-4 rounded-4xl border border-white/10 bg-base-200/50 p-6">
		<div>
			<p class="text-xs uppercase tracking-[0.3em] text-base-content/45">Projects</p>
			<h1 class="mt-2 text-4xl font-semibold text-white">Everything durable belongs to a project.</h1>
		</div>
		<a class="btn btn-primary" href="/projects/new">New project</a>
	</section>

	<div class="flex flex-wrap items-center justify-between gap-3">
		<div class="tabs tabs-boxed w-fit bg-base-200/50">
			{#each statuses as status}
				<a class="tab gap-2" class:tab-active={data.status === status} href={`/projects?status=${status}`}>
					<span>{status.replace('_', ' ')}</span>
					<span class="rounded-full bg-base-300/70 px-2 py-0.5 text-[0.7rem]">{data.counts[status]}</span>
				</a>
			{/each}
		</div>

		<label class="grid gap-2">
			<span class="text-xs uppercase tracking-[0.24em] text-base-content/45">Sort</span>
			<select class="select select-bordered select-sm min-w-44" bind:value={sortMode}>
				<option value="manual">Manual order</option>
				<option value="updated">Recently updated</option>
				<option value="title">Title A-Z</option>
			</select>
		</label>
	</div>

	<div class="flex flex-wrap items-center justify-between gap-3 text-sm text-base-content/55">
		<p>
			{sortMode === 'manual'
				? 'Drag cards or use the move buttons to set the order for this status lane.'
				: sortMode === 'updated'
					? 'Sorted by the most recently updated projects.'
					: 'Sorted alphabetically by project title.'}
		</p>
		{#if savingOrder}
			<span class="text-xs uppercase tracking-[0.24em] text-base-content/45">Saving order…</span>
		{/if}
	</div>

	{#if orderError}
		<p class="text-sm text-error">{orderError}</p>
	{/if}

	{#if visibleProjects.length}
		<div class="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
			{#each visibleProjects as project (project.id)}
				<article
					class={`rounded-[1.8rem] border bg-base-200/45 p-5 transition ${
						dropProjectId === project.id && dragProjectId !== project.id
							? 'border-info/55 ring-1 ring-info/30'
							: 'border-white/10 hover:-translate-y-0.5 hover:border-info/30'
					} ${dragProjectId === project.id ? 'opacity-65' : ''}`}
					draggable={sortMode === 'manual' && !savingOrder}
					ondragstart={(event) => handleDragStart(event, project.id)}
					ondragover={(event) => handleDragOver(event, project.id)}
					ondragenter={(event) => handleDragOver(event, project.id)}
					ondrop={(event) => handleDrop(event, project.id)}
					ondragend={clearDragState}
				>
					<div class="flex items-start justify-between gap-4">
						<div class="min-w-0">
							<a class="block" href={`/projects/${project.slug}`}>
								<h2 class="text-2xl font-semibold text-white">{project.title}</h2>
								<p class="mt-1 text-sm text-base-content/60">{project.summary || 'No summary yet.'}</p>
							</a>
						</div>
						<div class="grid gap-2 text-right">
							<span class="badge badge-outline">{project.kind}</span>
							<span class="badge badge-ghost">{project.status}</span>
						</div>
					</div>

					<div class="mt-5 flex items-center justify-between gap-3">
						<p class="text-xs uppercase tracking-[0.25em] text-base-content/45">Updated {formatRelative(project.updated_at)}</p>
						{#if sortMode === 'manual'}
							<div class="flex items-center gap-2">
								<button
									type="button"
									class="btn btn-ghost btn-xs"
									onclick={() => moveProject(project.id, -1)}
									disabled={!canMove(project.id, -1)}
									aria-label={`Move ${project.title} up`}
								>
									Up
								</button>
								<button
									type="button"
									class="btn btn-ghost btn-xs"
									onclick={() => moveProject(project.id, 1)}
									disabled={!canMove(project.id, 1)}
									aria-label={`Move ${project.title} down`}
								>
									Down
								</button>
								<span class="text-[0.7rem] uppercase tracking-[0.24em] text-base-content/40">Drag</span>
							</div>
						{/if}
					</div>
				</article>
			{/each}
		</div>
	{:else}
		<div class="rounded-[1.8rem] border border-dashed border-white/10 bg-base-200/35 p-10 text-center text-base-content/55">
			No projects match this status yet.
		</div>
	{/if}
</div>
