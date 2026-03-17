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

<div class="grid gap-6">
	<section class="rounded-[2rem] border border-white/10 bg-base-200/50 p-6">
		<div class="flex flex-wrap items-start justify-between gap-4">
			<div>
				<p class="text-xs uppercase tracking-[0.3em] text-base-content/45">Project workspace</p>
				<h1 class="mt-2 text-4xl font-semibold text-white">{dashboard.project.title}</h1>
				<p class="mt-3 max-w-3xl text-base-content/65">
					One dashboard for the brief, tasks, meeting history, and durable notes. Edit the project details here instead of hunting for a separate project home.
				</p>
			</div>
			<div class="grid grid-cols-3 gap-3">
				<div class="rounded-[1.2rem] border border-white/10 bg-base-300/25 px-4 py-3 text-center">
					<p class="text-xs uppercase tracking-[0.24em] text-base-content/45">Open work</p>
					<p class="mt-1 text-2xl font-semibold text-white">{openTasks}</p>
				</div>
				<div class="rounded-[1.2rem] border border-white/10 bg-base-300/25 px-4 py-3 text-center">
					<p class="text-xs uppercase tracking-[0.24em] text-base-content/45">Notes</p>
					<p class="mt-1 text-2xl font-semibold text-white">{dashboard.notesByKind.note.length + dashboard.notesByKind.doc.length + dashboard.notesByKind.decision.length}</p>
				</div>
				<div class="rounded-[1.2rem] border border-white/10 bg-base-300/25 px-4 py-3 text-center">
					<p class="text-xs uppercase tracking-[0.24em] text-base-content/45">Meetings</p>
					<p class="mt-1 text-2xl font-semibold text-white">{dashboard.meetings.length}</p>
				</div>
			</div>
		</div>

		<div class="mt-6 grid gap-4 rounded-[1.6rem] border border-white/10 bg-base-300/20 p-5 lg:grid-cols-[minmax(0,1fr)_13rem_13rem_auto]">
			<label class="grid gap-2">
				<span class="text-xs uppercase tracking-[0.24em] text-base-content/45">Title & summary</span>
				<div class="grid gap-3">
					<input class="input input-bordered w-full" bind:value={projectTitle} />
					<textarea class="textarea textarea-bordered min-h-24 w-full" bind:value={projectSummary} placeholder="Describe the scope, owner, current state, and how this project should be used."></textarea>
				</div>
			</label>
			<label class="grid gap-2">
				<span class="text-xs uppercase tracking-[0.24em] text-base-content/45">Kind</span>
				<select class="select select-bordered w-full" bind:value={projectKind}>
					<option value="standard">Standard</option>
					<option value="perpetual">Perpetual</option>
				</select>
			</label>
			<label class="grid gap-2">
				<span class="text-xs uppercase tracking-[0.24em] text-base-content/45">Status</span>
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
					<p>{totalTasks} task lanes tracked</p>
				</div>
				<button class="btn btn-primary" onclick={saveProject} disabled={projectSaving}>
					{projectSaving ? 'Saving…' : 'Save project'}
				</button>
			</div>
		</div>
		{#if projectError}
			<p class="mt-3 text-sm text-error">{projectError}</p>
		{/if}
	</section>

	<div class="grid gap-6 xl:grid-cols-[minmax(0,1.18fr)_minmax(340px,0.82fr)]">
		<div class="grid gap-6">
			<section class="rounded-[1.8rem] border border-white/10 bg-base-200/45 p-5">
				<div class="flex items-center justify-between gap-3">
					<div>
						<h2 class="text-xl font-semibold text-white">Work queue</h2>
						<p class="mt-1 text-sm text-base-content/60">Every task is editable here, including title, notes, status, priority, dates, and subtasks.</p>
					</div>
					<span class="text-xs uppercase tracking-[0.24em] text-base-content/45">{openTasks} open</span>
				</div>

				<div class="mt-4">
					<TaskComposer projectId={dashboard.project.id} submitLabel="Add task" />
				</div>

				<div class="mt-6 grid gap-6">
					{#each taskStatuses as status}
						<div class="grid gap-3">
							<div class="flex items-center justify-between">
								<h3 class="text-sm font-medium uppercase tracking-[0.25em] text-base-content/55">{status.replaceAll('_', ' ')}</h3>
								<span class="text-xs text-base-content/45">{dashboard.taskGroups[status].length}</span>
							</div>
							{#if dashboard.taskGroups[status].length}
								<TaskTree items={dashboard.taskGroups[status]} project={dashboard.project} {highlightedTaskId} />
							{:else}
								<p class="rounded-[1.25rem] border border-dashed border-white/10 bg-base-300/15 px-4 py-5 text-sm text-base-content/45">Nothing here yet.</p>
							{/if}
						</div>
					{/each}
				</div>
			</section>
		</div>

		<div class="grid gap-6">
			<section class="rounded-[1.8rem] border border-white/10 bg-base-200/45 p-5">
				<div class="flex items-center justify-between gap-3">
					<div>
						<h2 class="text-xl font-semibold text-white">Project brief & notes</h2>
						<p class="mt-1 text-sm text-base-content/60">The overview note is the durable brief. Notes, docs, and decisions sit beside it.</p>
					</div>
				</div>

				{#if dashboard.homeNote}
					<a class="mt-4 block rounded-[1.2rem] border border-white/10 bg-base-300/25 px-4 py-4 transition hover:border-info/30" href={`/projects/${dashboard.project.slug}/notes/${dashboard.homeNote.note.id}`}>
						<p class="text-xs uppercase tracking-[0.24em] text-base-content/45">Project overview</p>
						<p class="mt-2 font-medium text-white">{dashboard.homeNote.note.title}</p>
						<p class="mt-1 text-sm text-base-content/60">{dashboard.homeNote.note.excerpt || 'Open the overview note to capture scope, current status, and key context.'}</p>
					</a>
				{/if}

				<div class="mt-4 grid gap-3 rounded-[1.35rem] border border-white/10 bg-base-300/20 p-4">
					<p class="text-xs uppercase tracking-[0.24em] text-base-content/45">Create a note</p>
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
								<p class="text-xs uppercase tracking-[0.25em] text-base-content/45">{kind}s</p>
								<span class="text-xs text-base-content/45">{dashboard.notesByKind[kind].length}</span>
							</div>
							{#if dashboard.notesByKind[kind].length}
								{#each dashboard.notesByKind[kind] as note}
									<a class="rounded-[1.1rem] border border-white/10 bg-base-300/25 px-4 py-3 transition hover:border-info/30" href={`/projects/${dashboard.project.slug}/notes/${note.id}`}>
										<p class="font-medium text-white">{note.title}</p>
										<p class="text-sm text-base-content/55">{note.excerpt || 'No summary yet.'}</p>
									</a>
								{/each}
							{:else}
								<p class="rounded-[1.1rem] border border-dashed border-white/10 bg-base-300/15 px-4 py-4 text-sm text-base-content/45">No {kind}s yet.</p>
							{/if}
						</div>
					{/each}
				</div>
			</section>

			<section class="rounded-[1.8rem] border border-white/10 bg-base-200/45 p-5">
				<div class="flex items-center justify-between gap-3">
					<div>
						<h2 class="text-xl font-semibold text-white">Meetings</h2>
						<p class="mt-1 text-sm text-base-content/60">Meeting notes stay tied to this project and can turn checkbox items into tasks.</p>
					</div>
				</div>

				<div class="mt-4 grid gap-3 rounded-[1.35rem] border border-white/10 bg-base-300/20 p-4">
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

				<div class="mt-4 grid gap-3">
					{#if dashboard.meetings.length}
						{#each dashboard.meetings as meeting}
							<a class="rounded-[1.2rem] border border-white/10 bg-base-300/25 px-4 py-3 transition hover:border-info/30" href={`/projects/${dashboard.project.slug}/meetings/${meeting.id}`}>
								<p class="font-medium text-white">{meeting.title}</p>
								<p class="text-sm text-base-content/60">{formatDate(meeting.meeting_date)} · {meeting.task_count} linked tasks</p>
								<p class="mt-1 text-sm text-base-content/55">{meeting.excerpt || 'No summary yet.'}</p>
							</a>
						{/each}
					{:else}
						<p class="rounded-[1.2rem] border border-dashed border-white/10 bg-base-300/15 px-4 py-5 text-sm text-base-content/45">No meetings yet.</p>
					{/if}
				</div>
			</section>

			<section class="rounded-[1.8rem] border border-white/10 bg-base-200/45 p-5">
				<h2 class="text-xl font-semibold text-white">Linked context</h2>
				<div class="mt-4 grid gap-3">
					{#if dashboard.backlinks.length}
						{#each dashboard.backlinks as backlink}
							<a class="rounded-[1.1rem] border border-white/10 bg-base-300/25 px-4 py-3 transition hover:border-info/30" href={backlink.href ?? `/projects/${dashboard.project.slug}`}>
								<p class="font-medium text-white">{backlink.title}</p>
								<p class="text-sm text-base-content/55">{backlink.projectTitle ?? backlink.fromType}</p>
								<p class="text-sm text-base-content/45">{backlink.snippet || 'No summary yet.'}</p>
							</a>
						{/each}
					{/if}
					{#each dashboard.activity as item}
						<a class="rounded-[1.1rem] border border-white/10 bg-base-300/15 px-4 py-3 transition hover:border-info/30" href={item.href ?? `/projects/${dashboard.project.slug}`}>
							<p class="font-medium text-white">{item.title}</p>
							<p class="text-sm text-base-content/55">{item.type} · {formatRelative(item.updatedAt)}</p>
						</a>
					{/each}
					{#if !dashboard.backlinks.length && !dashboard.activity.length}
						<p class="rounded-[1.1rem] border border-dashed border-white/10 bg-base-300/15 px-4 py-5 text-sm text-base-content/45">Links into this project will appear here once you start connecting notes and tasks.</p>
					{/if}
				</div>
			</section>
		</div>
	</div>
</div>
