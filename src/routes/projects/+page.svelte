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

<div class="bp-page">
	<section class="bp-hero p-6 md:p-7">
		<div class="bp-toolbar">
			<div>
				<p class="bp-kicker">Projects</p>
				<h1 class="bp-page-title">Projects</h1>
				<p class="bp-copy">Every durable stream of work gets a home.</p>
			</div>
			<a class="btn btn-primary" href="/projects/new">New project</a>
		</div>
		<div class="mt-5 bp-stat-grid md:grid-cols-4">
			{#each statuses as status}
				<div class="bp-stat">
					<p class="bp-meta">{status.replace('_', ' ')}</p>
					<p class="bp-stat-value">{data.counts[status]}</p>
				</div>
			{/each}
		</div>
	</section>

	<section class="bp-panel p-5">
		<div class="relative z-10 grid gap-4 xl:grid-cols-[minmax(0,1fr)_14rem] xl:items-end">
			<div class="tabs tabs-boxed w-fit">
				{#each statuses as status}
					<a class="tab gap-2" class:tab-active={data.status === status} href={`/projects?status=${status}`}>
						<span>{status.replace('_', ' ')}</span>
						<span class="rounded-full bg-white/10 px-2 py-0.5 text-[0.7rem]">{data.counts[status]}</span>
					</a>
				{/each}
			</div>

			<label class="grid gap-2">
				<span class="bp-meta">Sort</span>
				<select class="select select-bordered min-w-[11rem]" bind:value={sortMode}>
					<option value="manual">Manual order</option>
					<option value="updated">Recently updated</option>
					<option value="title">Title A-Z</option>
				</select>
			</label>
		</div>

		<div class="relative z-10 mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-base-content/55">
			<p>
				{sortMode === 'manual'
					? 'Drag cards or use the move controls to set the lane order.'
					: sortMode === 'updated'
						? 'Sorted by the most recently updated projects.'
						: 'Sorted alphabetically by project title.'}
			</p>
			{#if savingOrder}
				<span class="bp-meta">Saving order</span>
			{/if}
		</div>
	</section>

	{#if orderError}
		<p class="text-sm text-error">{orderError}</p>
	{/if}

	{#if visibleProjects.length}
		<div class="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
			{#each visibleProjects as project (project.id)}
				<article
					class={`bp-panel p-5 transition ${
						dropProjectId === project.id && dragProjectId !== project.id
							? 'border-info/55 ring-1 ring-info/30'
							: 'hover:-translate-y-0.5 hover:border-info/30'
					} ${dragProjectId === project.id ? 'opacity-65' : ''}`}
					draggable={sortMode === 'manual' && !savingOrder}
					ondragstart={(event) => handleDragStart(event, project.id)}
					ondragover={(event) => handleDragOver(event, project.id)}
					ondragenter={(event) => handleDragOver(event, project.id)}
					ondrop={(event) => handleDrop(event, project.id)}
					ondragend={clearDragState}
				>
					<div class="relative z-10 flex h-full flex-col justify-between gap-6">
						<div class="flex items-start justify-between gap-4">
							<div class="min-w-0">
								<a class="block" href={`/projects/${project.slug}`}>
									<h2 class="text-2xl font-semibold text-white">{project.title}</h2>
									{#if project.summary}
										<p class="mt-2 text-sm leading-6 text-base-content/58">{project.summary}</p>
									{/if}
								</a>
							</div>
							<div class="grid gap-2 text-right">
								<span class="badge badge-outline">{project.kind}</span>
								<span class="badge badge-ghost">{project.status}</span>
							</div>
						</div>

						<div class="flex items-center justify-between gap-3">
							<p class="bp-meta">Updated {formatRelative(project.updated_at)}</p>
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
									<span class="bp-meta">Drag</span>
								</div>
							{/if}
						</div>
					</div>
				</article>
			{/each}
		</div>
	{:else}
		<div class="bp-empty p-10 text-center">No projects match this status yet.</div>
	{/if}
</div>
