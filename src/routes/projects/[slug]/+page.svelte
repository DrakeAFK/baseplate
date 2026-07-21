<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import TaskComposer from '$lib/components/tasks/TaskComposer.svelte';
	import TaskTree from '$lib/components/tasks/TaskTree.svelte';
	import type { ProjectKind, ProjectStatus, TaskStatus, TaskTreeItem } from '$lib/types/models';
	import { formatDate, formatRelative, todayDate } from '$lib/utils/dates';
	import { untrack } from 'svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let dashboard = $state(untrack(() => data));
	let projectTitle = $state(untrack(() => data.project.title));
	let projectSummary = $state(untrack(() => data.project.summary));
	let repoPath = $state(untrack(() => data.project.repo_path ?? ''));
	let projectKind = $state<ProjectKind>(untrack(() => data.project.kind));
	let projectStatus = $state<ProjectStatus>(untrack(() => data.project.status));
	let projectSaving = $state(false);
	let projectError = $state('');

	let noteTitle = $state('');
	let noteKind = $state<'note' | 'doc' | 'decision'>('note');
	let noteSaving = $state(false);
	let noteError = $state('');

	let meetingTitle = $state('');
	let meetingDate = $state(todayDate());
	let meetingSaving = $state(false);
	let meetingError = $state('');

	const openTaskStatuses: TaskStatus[] = ['in_progress', 'blocked', 'todo'];
	const closedTaskStatuses: TaskStatus[] = ['done', 'cancelled'];
	const noteSections: Array<{
		kind: 'note' | 'doc' | 'decision';
		label: string;
		description: string;
		empty: string;
	}> = [
		{
			kind: 'note',
			label: 'Working notes',
			description: 'Loose context, rough thinking, and in-flight notes.',
			empty: 'No working notes yet.'
		},
		{
			kind: 'doc',
			label: 'Docs',
			description: 'Reference material, specs, and durable documentation.',
			empty: 'No docs yet.'
		},
		{
			kind: 'decision',
			label: 'Decisions',
			description: 'Call the shots and keep the why close to the work.',
			empty: 'No decisions yet.'
		}
	];
	const taskLaneMeta: Record<TaskStatus, { title: string; description: string }> = {
		in_progress: {
			title: 'In progress',
			description: 'Actively moving work. Keep this tight and current.'
		},
		blocked: {
			title: 'Blocked',
			description: 'Waiting on a decision, dependency, or handoff.'
		},
		todo: {
			title: 'Ready next',
			description: 'Defined work that is ready to pull when capacity opens.'
		},
		done: {
			title: 'Done',
			description: 'Completed work, kept visible without crowding the queue.'
		},
		cancelled: {
			title: 'Cancelled',
			description: 'Explicitly dropped work so the project history stays honest.'
		}
	};
	const highlightedTaskId = $derived(page.url.hash.startsWith('#task-') ? page.url.hash.slice(6) : null);

	function countTasks(items: TaskTreeItem[]): number {
		return items.reduce((sum, item) => sum + 1 + countTasks(item.children), 0);
	}

	function laneCount(status: TaskStatus): number {
		return countTasks(dashboard.taskGroups[status]);
	}

	const totalTasks = $derived([...openTaskStatuses, ...closedTaskStatuses].reduce((sum, status) => sum + laneCount(status), 0));
	const openTasks = $derived(openTaskStatuses.reduce((sum, status) => sum + laneCount(status), 0));
	const blockedTasks = $derived(laneCount('blocked'));
	const completedTasks = $derived(laneCount('done'));
	const projectNoteCount = $derived(noteSections.reduce((sum, section) => sum + dashboard.notesByKind[section.kind].length, 0));

	$effect(() => {
		dashboard = data;
		projectTitle = data.project.title;
		projectSummary = data.project.summary;
		repoPath = data.project.repo_path ?? '';
		projectKind = data.project.kind;
		projectStatus = data.project.status;
	});

	async function saveProject(): Promise<void> {
		projectSaving = true;
		projectError = '';
		const response = await fetch(`/api/projects/${dashboard.project.id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				title: projectTitle,
				summary: projectSummary,
				repo_path: repoPath,
				kind: projectKind,
				status: projectStatus
			})
		});
		const payload = await response.json().catch(() => null);
		projectSaving = false;
		if (!response.ok) {
			projectError = payload?.error ?? 'Unable to update project';
			return;
		}
		await invalidateAll();
	}

	async function createNote(): Promise<void> {
		if (!noteTitle.trim() || noteSaving) return;
		noteSaving = true;
		noteError = '';
		const response = await fetch('/api/notes', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ projectId: dashboard.project.id, title: noteTitle, kind: noteKind })
		});
		const payload = await response.json().catch(() => null);
		noteSaving = false;
		if (!response.ok) {
			noteError = payload?.error ?? 'Unable to create note';
			return;
		}
		noteTitle = '';
		noteKind = 'note';
		await goto(`/projects/${dashboard.project.slug}/notes/${payload.note.id}`);
	}

	async function createMeeting(): Promise<void> {
		if (!meetingTitle.trim() || meetingSaving) return;
		meetingSaving = true;
		meetingError = '';
		const response = await fetch('/api/meetings', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ projectId: dashboard.project.id, title: meetingTitle, meetingDate })
		});
		const payload = await response.json().catch(() => null);
		meetingSaving = false;
		if (!response.ok) {
			meetingError = payload?.error ?? 'Unable to create meeting';
			return;
		}
		meetingTitle = '';
		meetingDate = todayDate();
		await goto(`/projects/${dashboard.project.slug}/meetings/${payload.meeting.id}`);
	}
</script>

<div class="bp-page">
	<section class="bp-hero pb-4">
		<div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_28rem] xl:items-start">
			<div class="grid gap-3">
				<div class="flex flex-wrap items-center gap-2">
					<span class="bp-pill">{projectKind}</span>
					<span class="bp-pill">{projectStatus.replace('_', ' ')}</span>
					<span class="bp-meta">Updated {formatRelative(dashboard.project.updated_at)}</span>
				</div>
				<label class="grid gap-2">
					<span class="bp-meta">Title</span>
					<input class="input input-bordered h-12 w-full text-[1.45rem] font-semibold text-white" bind:value={projectTitle} />
				</label>
				<label class="grid gap-2">
					<span class="bp-meta">Brief</span>
					<textarea class="textarea textarea-bordered min-h-20 w-full" bind:value={projectSummary} placeholder="Scope, owner, current direction"></textarea>
				</label>
				<label class="grid gap-2">
					<span class="bp-meta">Repository</span>
					<input class="input input-bordered w-full font-mono text-sm" bind:value={repoPath} placeholder="/absolute/path/to/repository" />
				</label>
			</div>

			<div class="grid gap-3">
				<div class="bp-stat-grid grid-cols-2">
					<div class="bp-stat">
						<p class="bp-meta">Open</p>
						<p class="bp-stat-value">{openTasks}</p>
					</div>
					<div class="bp-stat">
						<p class="bp-meta">Blocked</p>
						<p class="bp-stat-value">{blockedTasks}</p>
					</div>
					<div class="bp-stat">
						<p class="bp-meta">Notes</p>
						<p class="bp-stat-value">{projectNoteCount}</p>
					</div>
					<div class="bp-stat">
						<p class="bp-meta">Meetings</p>
						<p class="bp-stat-value">{dashboard.meetings.length}</p>
					</div>
				</div>
				<div class="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
					<label class="grid gap-2">
						<span class="bp-meta">Kind</span>
						<select class="select select-bordered w-full" bind:value={projectKind}>
							<option value="standard">Standard</option>
							<option value="perpetual">Perpetual</option>
						</select>
					</label>
					<label class="grid gap-2">
						<span class="bp-meta">Status</span>
						<select class="select select-bordered w-full" bind:value={projectStatus}>
							<option value="active">Active</option>
							<option value="on_hold">On hold</option>
							<option value="completed">Completed</option>
							<option value="archived">Archived</option>
						</select>
					</label>
					<div class="flex items-end">
						<button class="btn btn-primary w-full sm:w-auto" onclick={saveProject} disabled={projectSaving}>
							{projectSaving ? 'Saving...' : 'Save'}
						</button>
					</div>
				</div>
				<div class="flex flex-wrap gap-2">
					<span class="bp-pill">{totalTasks} tasks</span>
					<span class="bp-pill">{completedTasks} done</span>
					<span class="bp-pill">{dashboard.backlinks.length} backlinks</span>
				</div>
				{#if dashboard.repository}
					<div class="bp-repo-status" class:has-attention={Boolean(dashboard.repository.error)}>
						<div class="min-w-0">
							<p class="truncate font-mono text-sm text-white">{dashboard.repository.path}</p>
							{#if dashboard.repository.error}
								<p class="mt-1 text-xs text-error">{dashboard.repository.error}</p>
							{:else}
								<p class="bp-meta mt-1 normal-case">{dashboard.repository.lastCommit}</p>
							{/if}
						</div>
						{#if dashboard.repository.isGitRepository}
							<div class="flex flex-wrap justify-end gap-2">
								<span class="bp-count is-moving">{dashboard.repository.branch}</span>
								<span class="bp-count" class:is-danger={dashboard.repository.dirtyCount > 0}>{dashboard.repository.dirtyCount} changed</span>
								{#if dashboard.repository.ahead > 0}<span class="bp-count">↑ {dashboard.repository.ahead}</span>{/if}
								{#if dashboard.repository.behind > 0}<span class="bp-count is-danger">↓ {dashboard.repository.behind}</span>{/if}
							</div>
						{/if}
					</div>
				{/if}
				{#if projectError}
					<p class="text-sm text-error">{projectError}</p>
				{/if}
			</div>
		</div>
	</section>

	<div class="bp-page-grid">
		<section id="tasks" class="bp-panel p-4">
			<div class="bp-toolbar">
				<div>
					<h2 class="bp-section-title">Execution</h2>
					<p class="bp-meta mt-1">{laneCount('in_progress')} in progress / {laneCount('blocked')} blocked / {laneCount('todo')} todo</p>
				</div>
				<div class="bp-inline-stats">
					<span class="bp-pill bp-pill-green">{openTasks} open</span>
					<span class="bp-pill bp-pill-yellow">{blockedTasks} blocked</span>
				</div>
			</div>

			<div class="mt-4">
				<TaskComposer projectId={dashboard.project.id} submitLabel="Add task" />
			</div>

			<div class="bp-section-stack mt-4">
				{#each openTaskStatuses as status}
					<section class="bp-task-lane">
						<div class="bp-task-lane-header">
							<p class="font-semibold text-white">{taskLaneMeta[status].title}</p>
							<span class="bp-pill">{laneCount(status)}</span>
						</div>

						{#if dashboard.taskGroups[status].length}
							<TaskTree items={dashboard.taskGroups[status]} project={dashboard.project} {highlightedTaskId} />
						{:else}
							<p class="bp-empty">Clear.</p>
						{/if}
					</section>
				{/each}
			</div>

			<details class="bp-panel-soft mt-4 p-3">
				<summary class="cursor-pointer font-semibold text-white">Closed work ({completedTasks + laneCount('cancelled')})</summary>
				<div class="mt-3 grid gap-3 lg:grid-cols-2">
					{#each closedTaskStatuses as status}
						<section class="bp-task-lane">
							<div class="bp-task-lane-header">
								<p class="font-semibold text-white">{taskLaneMeta[status].title}</p>
								<span class="bp-pill">{laneCount(status)}</span>
							</div>

							{#if dashboard.taskGroups[status].length}
								<TaskTree items={dashboard.taskGroups[status]} project={dashboard.project} {highlightedTaskId} />
							{:else}
								<p class="bp-empty">None.</p>
							{/if}
						</section>
					{/each}
				</div>
			</details>
		</section>

		<aside class="grid content-start gap-4">
			<section id="notes" class="bp-panel p-4">
				<div class="bp-toolbar">
					<h2 class="bp-section-title">Notes</h2>
					<span class="bp-meta">{projectNoteCount}</span>
				</div>

				{#if dashboard.homeNote}
					<a class="bp-list-card mt-3 block" href={`/projects/${dashboard.project.slug}/notes/${dashboard.homeNote.note.id}`}>
						<p class="bp-meta">Overview</p>
						<p class="mt-1 font-medium text-white">{dashboard.homeNote.note.title}</p>
						{#if dashboard.homeNote.note.excerpt}
							<p class="mt-2 text-sm text-base-content/60">{dashboard.homeNote.note.excerpt}</p>
						{/if}
					</a>
				{/if}

				<div class="mt-3 grid gap-2">
					<div class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem]">
						<input class="input input-bordered w-full" bind:value={noteTitle} placeholder="New note title" />
						<select class="select select-bordered w-full" bind:value={noteKind}>
							<option value="note">Note</option>
							<option value="doc">Doc</option>
							<option value="decision">Decision</option>
						</select>
					</div>
					<button class="btn btn-primary w-full" onclick={createNote} disabled={!noteTitle.trim() || noteSaving}>
						{noteSaving ? 'Creating...' : `Create ${noteKind}`}
					</button>
					{#if noteError}
						<p class="text-sm text-error">{noteError}</p>
					{/if}
				</div>

				<div class="bp-section-stack mt-4">
					{#each noteSections as section}
						<div class="grid gap-2">
							<div class="flex items-center justify-between">
								<p class="bp-meta">{section.label}</p>
								<span class="bp-meta">{dashboard.notesByKind[section.kind].length}</span>
							</div>
							{#if dashboard.notesByKind[section.kind].length}
								{#each dashboard.notesByKind[section.kind] as note}
									<a class="bp-list-card" href={`/projects/${dashboard.project.slug}/notes/${note.id}`}>
										<p class="font-medium text-white">{note.title}</p>
										{#if note.excerpt}
											<p class="mt-2 line-clamp-2 text-sm text-base-content/55">{note.excerpt}</p>
										{/if}
									</a>
								{/each}
							{:else}
								<p class="bp-empty">{section.empty}</p>
							{/if}
						</div>
					{/each}
				</div>
			</section>

			<section id="meetings" class="bp-panel p-4">
				<div class="bp-toolbar">
					<h2 class="bp-section-title">Meetings</h2>
					<span class="bp-meta">{dashboard.meetings.length}</span>
				</div>

				<div class="mt-3 grid gap-2">
					<input class="input input-bordered w-full" bind:value={meetingTitle} placeholder="Meeting title" />
					<div class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
						<input class="input input-bordered w-full" type="date" bind:value={meetingDate} />
						<button class="btn btn-primary" onclick={createMeeting} disabled={!meetingTitle.trim() || meetingSaving}>
							{meetingSaving ? 'Creating...' : 'Create'}
						</button>
					</div>
					{#if meetingError}
						<p class="text-sm text-error">{meetingError}</p>
					{/if}
				</div>

				<div class="bp-list mt-4">
					{#if dashboard.meetings.length}
						{#each dashboard.meetings as meeting}
							<a class="bp-list-card" href={`/projects/${dashboard.project.slug}/meetings/${meeting.id}`}>
								<p class="font-medium text-white">{meeting.title}</p>
								<p class="mt-1 text-sm text-base-content/60">{formatDate(meeting.meeting_date)} / {meeting.task_count} tasks</p>
								{#if meeting.excerpt}
									<p class="mt-2 line-clamp-2 text-sm text-base-content/55">{meeting.excerpt}</p>
								{/if}
							</a>
						{/each}
					{:else}
						<p class="bp-empty">No meetings.</p>
					{/if}
				</div>
			</section>

			<section class="bp-panel p-4">
				<div class="bp-toolbar">
					<h2 class="bp-section-title">Context</h2>
					<span class="bp-meta">{dashboard.activity.length} activity</span>
				</div>
				<div class="bp-section-stack mt-4">
					<div class="grid gap-2">
						<div class="flex items-center justify-between gap-3">
							<p class="bp-meta">Backlinks</p>
							<span class="bp-meta">{dashboard.backlinks.length}</span>
						</div>
						{#if dashboard.backlinks.length}
							<div class="bp-list">
								{#each dashboard.backlinks as backlink}
									<a class="bp-list-card" href={backlink.href ?? `/projects/${dashboard.project.slug}`}>
										<p class="font-medium text-white">{backlink.title}</p>
										<p class="mt-1 text-sm text-base-content/55">{backlink.projectTitle ?? backlink.fromType}</p>
									</a>
								{/each}
							</div>
						{:else}
							<p class="bp-empty">No backlinks.</p>
						{/if}
					</div>

					<div class="bp-keyline"></div>

					<div class="grid gap-2">
						<div class="flex items-center justify-between gap-3">
							<p class="bp-meta">Activity</p>
							<span class="bp-meta">{dashboard.activity.length}</span>
						</div>
						{#if dashboard.activity.length}
							<div class="bp-list">
								{#each dashboard.activity as item}
									<a class="bp-list-card" href={item.href ?? `/projects/${dashboard.project.slug}`}>
										<p class="font-medium text-white">{item.title}</p>
										<p class="mt-1 text-sm text-base-content/55">{item.type} / {formatRelative(item.updatedAt)}</p>
									</a>
								{/each}
							</div>
						{:else}
							<p class="bp-empty">No activity.</p>
						{/if}
					</div>
				</div>
			</section>
		</aside>
	</div>
</div>
