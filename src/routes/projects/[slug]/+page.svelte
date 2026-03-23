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
		<div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
			<div class="grid gap-4">
				<div class="flex flex-wrap items-center gap-2">
					<span class="bp-pill">{projectKind}</span>
					<span class="bp-pill">{projectStatus.replace('_', ' ')}</span>
					<span class="bp-meta">Updated {formatRelative(dashboard.project.updated_at)}</span>
				</div>
				<div>
					<p class="bp-kicker">Project workspace</p>
					<h1 class="bp-page-title">{projectTitle}</h1>
					<p class="bp-copy">
						{projectSummary || 'Define the brief, keep execution tight, and let notes and meetings support the work instead of burying it.'}
					</p>
				</div>
			</div>

			<div class="bp-stat-grid sm:grid-cols-2">
				<div class="bp-stat">
					<p class="bp-meta">Open work</p>
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
		</div>

		<div class="mt-5 bp-panel-soft p-5">
			<div class="bp-toolbar">
				<div>
					<p class="bp-kicker">Project settings</p>
					<p class="mt-2 text-sm text-base-content/55">Keep the title, brief, and state honest so the queue stays grounded.</p>
				</div>
				<button class="btn btn-primary" onclick={saveProject} disabled={projectSaving}>
					{projectSaving ? 'Saving…' : 'Save project'}
				</button>
			</div>

			<div class="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_12rem_12rem_16rem]">
				<label class="grid gap-2">
					<span class="bp-meta">Title and brief</span>
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
				<div class="bp-list-card h-full">
					<p class="bp-meta">Tracking</p>
					<p class="mt-2 text-sm text-base-content/58">{totalTasks} tasks across the full queue</p>
					<p class="mt-2 text-sm text-base-content/58">{dashboard.backlinks.length} backlinks into this project</p>
					<p class="mt-2 text-sm text-base-content/58">{completedTasks} completed tasks preserved in history</p>
				</div>
			</div>
		</div>

		{#if projectError}
			<p class="mt-4 text-sm text-error">{projectError}</p>
		{/if}
	</section>

	<div class="grid gap-6 xl:grid-cols-[minmax(0,1.28fr)_minmax(340px,0.72fr)]">
		<div class="grid gap-6">
			<section id="tasks" class="bp-panel p-5">
				<div class="relative z-10">
					<div class="bp-toolbar">
						<div>
							<h2 class="text-xl font-semibold text-white">Execution board</h2>
							<p class="mt-1 text-sm text-base-content/58">
								Open work stays front and center. Completed history is still here, just no longer competing with the live queue.
							</p>
						</div>
						<div class="bp-inline-stats">
							<span class="bp-pill">{laneCount('in_progress')} in progress</span>
							<span class="bp-pill">{laneCount('blocked')} blocked</span>
							<span class="bp-pill">{laneCount('todo')} ready next</span>
						</div>
					</div>

					<div class="mt-5">
						<TaskComposer projectId={dashboard.project.id} submitLabel="Add task" />
					</div>

					<div class="mt-6 bp-section-stack">
						{#each openTaskStatuses as status}
							<section class="bp-task-lane">
								<div class="bp-task-lane-header">
									<div>
										<p class="text-base font-semibold text-white">{taskLaneMeta[status].title}</p>
										<p class="mt-1 text-sm text-base-content/55">{taskLaneMeta[status].description}</p>
									</div>
									<span class="bp-pill">{laneCount(status)} tasks</span>
								</div>

								{#if dashboard.taskGroups[status].length}
									<TaskTree items={dashboard.taskGroups[status]} project={dashboard.project} {highlightedTaskId} />
								{:else}
									<p class="bp-empty">{taskLaneMeta[status].title} is clear right now.</p>
								{/if}
							</section>
						{/each}
					</div>

					<div class="mt-6 grid gap-4 lg:grid-cols-2">
						{#each closedTaskStatuses as status}
							<section class="bp-task-lane">
								<div class="bp-task-lane-header">
									<div>
										<p class="text-base font-semibold text-white">{taskLaneMeta[status].title}</p>
										<p class="mt-1 text-sm text-base-content/55">{taskLaneMeta[status].description}</p>
									</div>
									<span class="bp-pill">{laneCount(status)} tasks</span>
								</div>

								{#if dashboard.taskGroups[status].length}
									<TaskTree items={dashboard.taskGroups[status]} project={dashboard.project} {highlightedTaskId} />
								{:else}
									<p class="bp-empty">No {taskLaneMeta[status].title.toLowerCase()} tasks right now.</p>
								{/if}
							</section>
						{/each}
					</div>
				</div>
			</section>
		</div>

		<div class="grid gap-6">
			<section id="notes" class="bp-panel p-5">
				<div class="relative z-10">
					<div class="flex items-center justify-between gap-3">
						<div>
							<h2 class="text-xl font-semibold text-white">Brief and notes</h2>
							<p class="mt-1 text-sm text-base-content/58">Project brief, working notes, docs, and decisions in one readable stack.</p>
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
						<div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_11rem_auto]">
							<input class="input input-bordered w-full" bind:value={noteTitle} placeholder="What do you want to capture?" />
							<select class="select select-bordered w-full" bind:value={noteKind}>
								<option value="note">Note</option>
								<option value="doc">Doc</option>
								<option value="decision">Decision</option>
							</select>
							<button class="btn btn-primary w-full md:w-auto" onclick={createNote} disabled={!noteTitle.trim() || noteSaving}>
								{noteSaving ? 'Creating…' : `Create ${noteKind}`}
							</button>
						</div>
						{#if noteError}
							<p class="text-sm text-error">{noteError}</p>
						{/if}
					</div>

					<div class="mt-4 bp-section-stack">
						{#each noteSections as section}
							<div class="grid gap-2">
								<div class="flex items-center justify-between">
									<div>
										<p class="bp-meta">{section.label}</p>
										<p class="mt-1 text-sm text-base-content/48">{section.description}</p>
									</div>
									<span class="bp-meta">{dashboard.notesByKind[section.kind].length}</span>
								</div>
								{#if dashboard.notesByKind[section.kind].length}
									{#each dashboard.notesByKind[section.kind] as note}
										<a class="bp-list-card" href={`/projects/${dashboard.project.slug}/notes/${note.id}`}>
											<p class="font-medium text-white">{note.title}</p>
											{#if note.excerpt}
												<p class="mt-2 text-sm text-base-content/55">{note.excerpt}</p>
											{/if}
										</a>
									{/each}
								{:else}
									<p class="bp-empty">{section.empty}</p>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			</section>

			<section id="meetings" class="bp-panel p-5">
				<div class="relative z-10">
					<h2 class="text-xl font-semibold text-white">Meetings</h2>
					<p class="mt-2 text-sm text-base-content/58">Keep decision-making and action capture anchored to the project timeline.</p>

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
					<h2 class="text-xl font-semibold text-white">Context and activity</h2>
					<div class="mt-4 bp-section-stack">
						<div class="grid gap-3">
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
											{#if backlink.snippet}
												<p class="mt-2 text-sm text-base-content/45">{backlink.snippet}</p>
											{/if}
										</a>
									{/each}
								</div>
							{:else}
								<p class="bp-empty">Linked notes and tasks show up here.</p>
							{/if}
						</div>

						<div class="bp-keyline"></div>

						<div class="grid gap-3">
							<div class="flex items-center justify-between gap-3">
								<p class="bp-meta">Recent activity</p>
								<span class="bp-meta">{dashboard.activity.length}</span>
							</div>
							{#if dashboard.activity.length}
								<div class="bp-list">
									{#each dashboard.activity as item}
										<a class="bp-list-card" href={item.href ?? `/projects/${dashboard.project.slug}`}>
											<p class="font-medium text-white">{item.title}</p>
											<p class="mt-1 text-sm text-base-content/55">{item.type} · {formatRelative(item.updatedAt)}</p>
										</a>
									{/each}
								</div>
							{:else}
								<p class="bp-empty">Recent tasks, meetings, and note updates appear here.</p>
							{/if}
						</div>
					</div>
				</div>
			</section>
		</div>
	</div>
</div>
