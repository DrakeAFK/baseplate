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

	const taskStatuses: TaskStatus[] = ['in_progress', 'blocked', 'todo', 'done', 'cancelled'];
	const noteKinds: Array<'note' | 'doc' | 'decision'> = ['note', 'doc', 'decision'];
	const highlightedTaskId = $derived(page.url.hash.startsWith('#task-') ? page.url.hash.slice(6) : null);

	function countTasks(items: TaskTreeItem[]): number {
		return items.reduce((sum, item) => sum + 1 + countTasks(item.children), 0);
	}

	const totalTasks = $derived(taskStatuses.reduce((sum, status) => sum + countTasks(dashboard.taskGroups[status]), 0));
	const openTasks = $derived(
		countTasks(dashboard.taskGroups.in_progress) + countTasks(dashboard.taskGroups.blocked) + countTasks(dashboard.taskGroups.todo)
	);

	$effect(() => {
		dashboard = data;
		projectTitle = data.project.title;
		projectSummary = data.project.summary;
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
	<section class="bp-hero p-6 md:p-7">
		<div class="bp-toolbar">
			<div>
				<p class="bp-kicker">Project workspace</p>
				<h1 class="bp-page-title">{dashboard.project.title}</h1>
				{#if dashboard.project.summary}
					<p class="bp-copy">{dashboard.project.summary}</p>
				{/if}
			</div>
			<div class="bp-inline-stats">
				<span class="bp-pill">{openTasks} open work</span>
				<span class="bp-pill">{dashboard.notesByKind.note.length + dashboard.notesByKind.doc.length + dashboard.notesByKind.decision.length} notes</span>
				<span class="bp-pill">{dashboard.meetings.length} meetings</span>
			</div>
		</div>

		<div class="mt-5 bp-panel-soft p-5">
			<div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_13rem_13rem_auto]">
				<label class="grid gap-2">
					<span class="bp-meta">Title and summary</span>
					<div class="grid gap-3">
						<input class="input input-bordered w-full" bind:value={projectTitle} />
						<textarea class="textarea textarea-bordered min-h-24 w-full" bind:value={projectSummary} placeholder="Scope, owner, and current direction"></textarea>
					</div>
				</label>
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
				<div class="flex flex-col justify-between gap-3">
					<div class="text-sm text-base-content/55">
						<p>Updated {formatRelative(dashboard.project.updated_at)}</p>
						<p>{totalTasks} tasks tracked</p>
					</div>
					<button class="btn btn-primary" onclick={saveProject} disabled={projectSaving}>
						{projectSaving ? 'Saving…' : 'Save project'}
					</button>
				</div>
			</div>
		</div>

		{#if projectError}
			<p class="mt-4 text-sm text-error">{projectError}</p>
		{/if}
	</section>

	<div class="grid gap-6 xl:grid-cols-[minmax(0,1.14fr)_minmax(340px,0.86fr)]">
		<section class="bp-panel p-5">
			<div class="relative z-10">
				<div class="flex items-center justify-between gap-3">
					<div>
						<h2 class="text-xl font-semibold text-white">Work queue</h2>
						<p class="mt-1 text-sm text-base-content/58">Tasks, dates, priorities, notes, and subtasks all stay editable here.</p>
					</div>
					<span class="bp-pill">{openTasks} open</span>
				</div>

				<div class="mt-5">
					<TaskComposer projectId={dashboard.project.id} submitLabel="Add task" />
				</div>

				<div class="mt-6 grid gap-6">
					{#each taskStatuses as status}
						<div class="grid gap-3">
							<div class="flex items-center justify-between">
								<h3 class="bp-meta">{status.replaceAll('_', ' ')}</h3>
								<span class="bp-meta">{dashboard.taskGroups[status].length}</span>
							</div>
							{#if dashboard.taskGroups[status].length}
								<TaskTree items={dashboard.taskGroups[status]} project={dashboard.project} {highlightedTaskId} />
							{:else}
								<p class="bp-empty">No tasks in this lane.</p>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		</section>

		<div class="grid gap-6">
			<section class="bp-panel p-5">
				<div class="relative z-10">
					<div class="flex items-center justify-between gap-3">
						<div>
							<h2 class="text-xl font-semibold text-white">Brief and notes</h2>
							<p class="mt-1 text-sm text-base-content/58">The overview, notes, docs, and decisions for this project.</p>
						</div>
					</div>

					{#if dashboard.homeNote}
						<a class="bp-list-card mt-4 block" href={`/projects/${dashboard.project.slug}/notes/${dashboard.homeNote.note.id}`}>
							<p class="bp-meta">Project overview</p>
							<p class="mt-2 font-medium text-white">{dashboard.homeNote.note.title}</p>
							{#if dashboard.homeNote.note.excerpt}
								<p class="mt-2 text-sm text-base-content/60">{dashboard.homeNote.note.excerpt}</p>
							{/if}
						</a>
					{/if}

					<div class="bp-panel-soft mt-4 grid gap-3 p-4">
						<p class="bp-kicker">Create a note</p>
						<input class="input input-bordered w-full" bind:value={noteTitle} placeholder="What do you want to capture?" />
						<div class="grid gap-3 md:grid-cols-[12rem_auto]">
							<select class="select select-bordered w-full" bind:value={noteKind}>
								<option value="note">Note</option>
								<option value="doc">Doc</option>
								<option value="decision">Decision</option>
							</select>
							<button class="btn btn-primary" onclick={createNote} disabled={!noteTitle.trim() || noteSaving}>
								{noteSaving ? 'Creating…' : `Create ${noteKind}`}
							</button>
						</div>
						{#if noteError}
							<p class="text-sm text-error">{noteError}</p>
						{/if}
					</div>

					<div class="mt-4 grid gap-4">
						{#each noteKinds as kind}
							<div class="grid gap-2">
								<div class="flex items-center justify-between">
									<p class="bp-meta">{kind}s</p>
									<span class="bp-meta">{dashboard.notesByKind[kind].length}</span>
								</div>
								{#if dashboard.notesByKind[kind].length}
									{#each dashboard.notesByKind[kind] as note}
										<a class="bp-list-card" href={`/projects/${dashboard.project.slug}/notes/${note.id}`}>
											<p class="font-medium text-white">{note.title}</p>
											{#if note.excerpt}
												<p class="mt-2 text-sm text-base-content/55">{note.excerpt}</p>
											{/if}
										</a>
									{/each}
								{:else}
									<p class="bp-empty">No {kind}s yet.</p>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			</section>

			<section class="bp-panel p-5">
				<div class="relative z-10">
					<h2 class="text-xl font-semibold text-white">Meetings</h2>

					<div class="bp-panel-soft mt-4 grid gap-3 p-4">
						<p class="bp-kicker">Create a meeting</p>
						<input class="input input-bordered w-full" bind:value={meetingTitle} placeholder="Meeting title" />
						<div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_12rem_auto]">
							<input class="input input-bordered w-full" type="date" bind:value={meetingDate} />
							<div></div>
							<button class="btn btn-primary" onclick={createMeeting} disabled={!meetingTitle.trim() || meetingSaving}>
								{meetingSaving ? 'Creating…' : 'Create meeting'}
							</button>
						</div>
						{#if meetingError}
							<p class="text-sm text-error">{meetingError}</p>
						{/if}
					</div>

					<div class="mt-4 bp-list">
						{#if dashboard.meetings.length}
							{#each dashboard.meetings as meeting}
								<a class="bp-list-card" href={`/projects/${dashboard.project.slug}/meetings/${meeting.id}`}>
									<p class="font-medium text-white">{meeting.title}</p>
									<p class="mt-1 text-sm text-base-content/60">{formatDate(meeting.meeting_date)} · {meeting.task_count} linked tasks</p>
									{#if meeting.excerpt}
										<p class="mt-2 text-sm text-base-content/55">{meeting.excerpt}</p>
									{/if}
								</a>
							{/each}
						{:else}
							<p class="bp-empty">No meetings yet.</p>
						{/if}
					</div>
				</div>
			</section>

			<section class="bp-panel p-5">
				<div class="relative z-10">
					<h2 class="text-xl font-semibold text-white">Linked context</h2>
					<div class="mt-4 bp-list">
						{#if dashboard.backlinks.length}
							{#each dashboard.backlinks as backlink}
								<a class="bp-list-card" href={backlink.href ?? `/projects/${dashboard.project.slug}`}>
									<p class="font-medium text-white">{backlink.title}</p>
									<p class="mt-1 text-sm text-base-content/55">{backlink.projectTitle ?? backlink.fromType}</p>
									{#if backlink.snippet}
										<p class="mt-2 text-sm text-base-content/45">{backlink.snippet}</p>
									{/if}
								</a>
							{/each}
						{/if}
						{#each dashboard.activity as item}
							<a class="bp-list-card" href={item.href ?? `/projects/${dashboard.project.slug}`}>
								<p class="font-medium text-white">{item.title}</p>
								<p class="mt-1 text-sm text-base-content/55">{item.type} · {formatRelative(item.updatedAt)}</p>
							</a>
						{/each}
						{#if !dashboard.backlinks.length && !dashboard.activity.length}
							<p class="bp-empty">Linked notes, tasks, and activity show up here.</p>
						{/if}
					</div>
				</div>
			</section>
		</div>
	</div>
</div>
