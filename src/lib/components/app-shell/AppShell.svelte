<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import CommandPalette from '$lib/components/command-palette/CommandPalette.svelte';
	import Logo from '$lib/assets/baseplate.svg';
	import type { AppShellData, TaskPriority, TaskStatus, WorkspacePulseKey } from '$lib/types/models';
	import { todayDate } from '$lib/utils/dates';
	import type { Snippet } from 'svelte';

	type Modal = 'project' | 'task' | 'meeting' | 'note';

	let { shell, children }: { shell: AppShellData; children: Snippet } = $props();

	let paletteOpen = $state(false);
	let modal = $state<Modal | null>(null);
	let pulseModal = $state<WorkspacePulseKey | null>(null);
	let error = $state('');

	let projectTitle = $state('');
	let projectKind = $state<'standard' | 'perpetual'>('standard');
	let projectSummary = $state('');

	let selectedProjectId = $state('');
	let taskTitle = $state('');
	let taskDescription = $state('');
	let taskPriority = $state<TaskPriority>('medium');
	let taskStatus = $state<TaskStatus>('todo');
	let taskScheduledFor = $state('');
	let taskDueAt = $state('');
	let meetingTitle = $state('');
	let meetingDate = $state(todayDate());
	let noteTitle = $state('');
	let noteKind = $state<'note' | 'doc' | 'decision'>('note');

	const navItems = [
		{ href: '/today', label: 'Today' },
		{ href: '/projects', label: 'Projects' },
		{ href: '/notes', label: 'Notes' },
		{ href: '/search', label: 'Search' },
		{ href: '/inbox', label: 'Inbox' },
		{ href: '/settings', label: 'Settings' }
	];
	const activePulse = $derived(
		pulseModal ? shell.pulseCollections.find((collection) => collection.key === pulseModal) ?? null : null
	);

	function currentProjectId(): string {
		const projectSlug = page.url.pathname.startsWith('/projects/') ? page.url.pathname.split('/')[2] : null;
		return shell.allProjects.find((item) => item.slug === projectSlug)?.id ?? shell.allProjects[0]?.id ?? '';
	}

	function resetProjectForm(): void {
		projectTitle = '';
		projectKind = 'standard';
		projectSummary = '';
	}

	function resetTaskForm(): void {
		selectedProjectId = currentProjectId();
		taskTitle = '';
		taskDescription = '';
		taskPriority = 'medium';
		taskStatus = 'todo';
		taskScheduledFor = '';
		taskDueAt = '';
	}

	function resetMeetingForm(): void {
		selectedProjectId = currentProjectId();
		meetingTitle = '';
		meetingDate = todayDate();
	}

	function resetNoteForm(): void {
		selectedProjectId = currentProjectId();
		noteTitle = '';
		noteKind = 'note';
	}

	function closeModal(): void {
		modal = null;
		pulseModal = null;
		error = '';
	}

	function openModal(next: Modal): void {
		error = '';
		pulseModal = null;
		if (next === 'project') resetProjectForm();
		if (next === 'task') resetTaskForm();
		if (next === 'meeting') resetMeetingForm();
		if (next === 'note') resetNoteForm();
		modal = next;
	}

	function openPulse(key: WorkspacePulseKey): void {
		error = '';
		modal = null;
		pulseModal = key;
	}

	function openAction(action: string): void {
		if (action === 'openCreateProject') openModal('project');
		if (action === 'openCreateTask') openModal('task');
		if (action === 'openCreateMeeting') openModal('meeting');
		if (action === 'openCreateNote') openModal('note');
	}

	$effect(() => {
		if (!selectedProjectId) {
			selectedProjectId = currentProjectId();
		}
	});

	async function submitProject(): Promise<void> {
		const response = await fetch('/api/projects', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ title: projectTitle, kind: projectKind, summary: projectSummary })
		});
		const payload = await response.json();
		if (!response.ok) {
			error = payload.error ?? 'Unable to create project';
			return;
		}
		closeModal();
		resetProjectForm();
		await goto(`/projects/${payload.project.slug}`);
	}

	async function submitTask(): Promise<void> {
		const response = await fetch('/api/tasks', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				projectId: selectedProjectId,
				title: taskTitle,
				description: taskDescription,
				priority: taskPriority,
				status: taskStatus,
				scheduledFor: taskScheduledFor || null,
				dueAt: taskDueAt || null
			})
		});
		const payload = await response.json().catch(() => null);
		if (!response.ok) {
			error = payload?.error ?? 'Unable to create task';
			return;
		}
		closeModal();
		resetTaskForm();
		await invalidateAll();
	}

	async function submitMeeting(): Promise<void> {
		const response = await fetch('/api/meetings', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ projectId: selectedProjectId, title: meetingTitle, meetingDate })
		});
		const payload = await response.json();
		if (!response.ok) {
			error = payload.error ?? 'Unable to create meeting';
			return;
		}
		const project = shell.allProjects.find((item) => item.id === selectedProjectId);
		closeModal();
		resetMeetingForm();
		await goto(`/projects/${project?.slug}/meetings/${payload.meeting.id}`);
	}

	async function submitNote(): Promise<void> {
		const response = await fetch('/api/notes', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ projectId: selectedProjectId, title: noteTitle, kind: noteKind })
		});
		const payload = await response.json();
		if (!response.ok) {
			error = payload.error ?? 'Unable to create note';
			return;
		}
		const project = shell.allProjects.find((item) => item.id === selectedProjectId);
		closeModal();
		resetNoteForm();
		await goto(`/projects/${project?.slug}/notes/${payload.note.id}`);
	}

	function keyHandler(event: KeyboardEvent): void {
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
			event.preventDefault();
			paletteOpen = !paletteOpen;
		}
		if (event.key === 'Escape') {
			paletteOpen = false;
			closeModal();
		}
	}
</script>

<svelte:window onkeydown={keyHandler} />

<div class="min-h-screen bg-[radial-gradient(circle_at_top,rgba(125,211,252,0.16),transparent_28%),linear-gradient(180deg,#0b1117_0%,#101720_45%,#0c131b_100%)] text-base-content">
	<div class="mx-auto grid min-h-screen max-w-450 gap-6 px-4 py-4 lg:grid-cols-[300px_minmax(0,1fr)] lg:px-6">
		<aside data-sveltekit-preload-data="off" class="rounded-4xl border border-white/10 bg-base-200/55 p-5 shadow-[0_20px_100px_rgba(0,0,0,0.35)]">
			<div class="mb-8 flex items-center justify-between gap-3">
				<div class="flex items-center gap-3">
					<img src={Logo} alt="Baseplate" class="w-10 h-auto" />
					<div>
						<p class="text-xs uppercase tracking-[0.4em] text-base-content/45">Workspace</p>
						<h1 class="text-2xl font-semibold text-white">baseplate.</h1>
					</div>
				</div>
				<button class="btn btn-primary btn-sm" onclick={() => openModal('project')}>New</button>
			</div>

			<nav class="grid gap-2">
				{#each navItems as item}
					<a class={`rounded-2xl px-4 py-3 text-sm transition hover:bg-base-300/60 ${page.url.pathname.startsWith(item.href) ? 'bg-base-300/70' : ''}`} href={item.href}>
						{item.label}
					</a>
				{/each}
			</nav>

			<div class="mt-8 grid gap-4">
				<div>
					<p class="text-xs uppercase tracking-[0.3em] text-base-content/45">Workspace pulse</p>
					<div class="mt-3 grid gap-3">
						{#each shell.pulseCollections as collection}
							<button
								type="button"
								class="rounded-[1.45rem] border border-white/10 bg-base-300/30 px-4 py-4 text-left transition hover:border-info/35 hover:bg-base-300/55"
								aria-haspopup="dialog"
								onclick={() => openPulse(collection.key)}
							>
								<div class="flex items-start justify-between gap-3">
									<div>
										<p class="text-xs uppercase tracking-[0.24em] text-base-content/45">{collection.label}</p>
										<p class="mt-1 text-sm text-base-content/60">{collection.description}</p>
									</div>
									<span class="rounded-full border border-white/10 bg-base-100/50 px-3 py-1 text-[0.68rem] uppercase tracking-[0.24em] text-base-content/50">
										Open
									</span>
								</div>
								<div class="mt-4 flex items-end gap-4">
									<div>
										<p class="text-3xl font-semibold leading-none text-white">{collection.count}</p>
										<p class="mt-1 text-[0.72rem] uppercase tracking-[0.24em] text-base-content/55">{collection.countLabel}</p>
									</div>
									<p class="text-xs uppercase leading-5 tracking-[0.22em] text-base-content/45">{collection.summary}</p>
								</div>
							</button>
						{/each}
					</div>
				</div>

				<!-- "RECENT" section -->
				<!-- <div>
					<div class="flex items-center justify-between">
						<p class="text-xs uppercase tracking-[0.3em] text-base-content/45">Recent</p>
						<a class="text-xs text-base-content/60" href="/search">Search all</a>
					</div>
					<div class="mt-3 grid gap-3">
						{#if shell.recentItems.length}
							{#each shell.recentItems as item (item.object_type + item.object_id)}
								<a class="rounded-[1.35rem] border border-white/10 bg-base-300/30 px-4 py-3 transition hover:border-info/40 hover:bg-base-300/60" href={item.href ?? '/search'}>
									<p class="font-medium text-white">{item.title}</p>
									<p class="text-xs uppercase tracking-[0.24em] text-base-content/45">{item.object_type.replace('_', ' ')}</p>
								</a>
							{/each}
						{:else}
							<div class="rounded-[1.35rem] border border-dashed border-white/10 bg-base-300/15 px-4 py-5 text-sm text-base-content/55">
								Recent work will appear here once you start moving through the workspace.
							</div>
						{/if}
					</div>
				</div> -->
			</div>
		</aside>

		<div class="grid min-h-screen grid-rows-[auto_1fr] gap-4">
			<header class="flex flex-wrap items-center justify-between gap-3 rounded-4xl border border-white/10 bg-base-200/45 px-5 py-4 shadow-[0_20px_80px_rgba(0,0,0,0.18)]">
				<button class="flex min-w-88 items-center justify-between rounded-[1.4rem] border border-white/10 bg-base-300/25 px-4 py-3 text-left text-sm text-base-content/60" onclick={() => (paletteOpen = true)}>
					<span>Jump anywhere, create anything</span>
					<kbd class="kbd kbd-sm border-white/10 bg-base-300/60">Ctrl K</kbd>
				</button>
				<div class="flex items-center gap-2">
					<button class="btn btn-ghost btn-sm" onclick={() => openModal('task')}>Task</button>
					<button class="btn btn-ghost btn-sm" onclick={() => openModal('meeting')}>Meeting</button>
					<button class="btn btn-ghost btn-sm" onclick={() => openModal('note')}>Note</button>
				</div>
			</header>

			<main class="pb-6">
				{@render children()}
			</main>
		</div>
	</div>

	<CommandPalette open={paletteOpen} items={shell.commandPaletteItems} onClose={() => (paletteOpen = false)} onAction={openAction} />

	{#if activePulse}
		<div class="fixed inset-0 z-40 bg-neutral/60 p-4 backdrop-blur-sm" role="button" tabindex="0" onclick={closeModal} onkeydown={(event) => event.key === 'Escape' && closeModal()}>
			<div class="mx-auto mt-10 max-w-5xl rounded-4xl border border-white/10 bg-base-100 p-6 shadow-[0_30px_120px_rgba(0,0,0,0.4)]" role="presentation" onclick={(event) => event.stopPropagation()}>
				<div class="flex flex-wrap items-start justify-between gap-4">
					<div>
						<p class="text-xs uppercase tracking-[0.24em] text-base-content/45">Workspace pulse</p>
						<h2 class="mt-2 text-2xl font-semibold text-white">{activePulse.label}</h2>
						<p class="mt-2 max-w-2xl text-sm text-base-content/60">{activePulse.description}</p>
					</div>
					<button type="button" class="btn btn-ghost btn-sm" onclick={closeModal}>Close</button>
				</div>

				{#if activePulse.rows.length}
					<div class="mt-6 max-h-[70vh] overflow-auto rounded-3xl border border-white/10 bg-base-200/45">
						<div class="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_10rem] gap-4 border-b border-white/10 px-5 py-3 text-xs uppercase tracking-[0.24em] text-base-content/45">
							{#each activePulse.columns as heading}
								<p>{heading}</p>
							{/each}
						</div>
						<div class="divide-y divide-white/10">
							{#each activePulse.rows as row}
								<div class="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_10rem] gap-4 px-5 py-4 text-sm">
									<div class="min-w-0">
										<a class="block truncate font-medium text-white transition hover:text-info" href={row.href ?? '#'} onclick={closeModal}>
											{row.primary}
										</a>
									</div>
									<p class="truncate text-base-content/60">{row.secondary}</p>
									<p class="text-base-content/55">{row.tertiary}</p>
								</div>
							{/each}
						</div>
					</div>
				{:else}
					<p class="mt-6 rounded-3xl border border-dashed border-white/10 bg-base-200/35 px-5 py-8 text-sm text-base-content/55">
						{activePulse.emptyMessage}
					</p>
				{/if}
			</div>
		</div>
	{/if}

	{#if modal}
		<div class="fixed inset-0 z-40 bg-neutral/60 p-4 backdrop-blur-sm" role="button" tabindex="0" onclick={closeModal} onkeydown={(event) => event.key === 'Escape' && closeModal()}>
			<div class="mx-auto mt-10 max-w-2xl rounded-4xl border border-white/10 bg-base-100 p-6 shadow-[0_30px_120px_rgba(0,0,0,0.4)]" role="presentation" onclick={(event) => event.stopPropagation()}>
				<h2 class="text-2xl font-semibold text-white">
					{modal === 'project' ? 'Create project' : modal === 'task' ? 'Create task' : modal === 'meeting' ? 'Create meeting' : 'Create note'}
				</h2>
				<div class="mt-5 grid gap-4">
					{#if modal === 'project'}
						<label class="grid gap-2">
							<span class="text-xs uppercase tracking-[0.24em] text-base-content/45">Title</span>
							<input class="input input-bordered" bind:value={projectTitle} placeholder="Project title" />
						</label>
						<div class="grid gap-4 md:grid-cols-[14rem_minmax(0,1fr)]">
							<label class="grid gap-2">
								<span class="text-xs uppercase tracking-[0.24em] text-base-content/45">Kind</span>
								<select class="select select-bordered" bind:value={projectKind}>
									<option value="standard">Standard</option>
									<option value="perpetual">Perpetual</option>
								</select>
							</label>
							<label class="grid gap-2">
								<span class="text-xs uppercase tracking-[0.24em] text-base-content/45">Summary</span>
								<textarea class="textarea textarea-bordered min-h-28" bind:value={projectSummary} placeholder="What this project is for, why it exists, and how to use it."></textarea>
							</label>
						</div>
					{:else}
						<label class="grid gap-2">
							<span class="text-xs uppercase tracking-[0.24em] text-base-content/45">Project</span>
							<select class="select select-bordered" bind:value={selectedProjectId}>
								{#each shell.allProjects as project}
									<option value={project.id}>{project.title}</option>
								{/each}
							</select>
						</label>
						{#if modal === 'task'}
							<label class="grid gap-2">
								<span class="text-xs uppercase tracking-[0.24em] text-base-content/45">Title</span>
								<input class="input input-bordered" bind:value={taskTitle} placeholder="Task title" />
							</label>
							<label class="grid gap-2">
								<span class="text-xs uppercase tracking-[0.24em] text-base-content/45">Working notes</span>
								<textarea class="textarea textarea-bordered min-h-28" bind:value={taskDescription} placeholder="Context, acceptance criteria, blockers, or links"></textarea>
							</label>
							<div class="grid gap-4 md:grid-cols-4">
								<label class="grid gap-2">
									<span class="text-xs uppercase tracking-[0.24em] text-base-content/45">Status</span>
									<select class="select select-bordered" bind:value={taskStatus}>
										<option value="todo">todo</option>
										<option value="in_progress">in progress</option>
										<option value="blocked">blocked</option>
										<option value="done">done</option>
										<option value="cancelled">cancelled</option>
									</select>
								</label>
								<label class="grid gap-2">
									<span class="text-xs uppercase tracking-[0.24em] text-base-content/45">Priority</span>
									<select class="select select-bordered" bind:value={taskPriority}>
										<option value="low">low</option>
										<option value="medium">medium</option>
										<option value="high">high</option>
										<option value="urgent">urgent</option>
									</select>
								</label>
								<label class="grid gap-2">
									<span class="text-xs uppercase tracking-[0.24em] text-base-content/45">Scheduled</span>
									<input class="input input-bordered" type="date" bind:value={taskScheduledFor} />
								</label>
								<label class="grid gap-2">
									<span class="text-xs uppercase tracking-[0.24em] text-base-content/45">Due</span>
									<input class="input input-bordered" type="date" bind:value={taskDueAt} />
								</label>
							</div>
						{:else if modal === 'meeting'}
							<label class="grid gap-2">
								<span class="text-xs uppercase tracking-[0.24em] text-base-content/45">Title</span>
								<input class="input input-bordered" bind:value={meetingTitle} placeholder="Meeting title" />
							</label>
							<label class="grid gap-2">
								<span class="text-xs uppercase tracking-[0.24em] text-base-content/45">Date</span>
								<input class="input input-bordered" type="date" bind:value={meetingDate} />
							</label>
						{:else}
							<label class="grid gap-2">
								<span class="text-xs uppercase tracking-[0.24em] text-base-content/45">Title</span>
								<input class="input input-bordered" bind:value={noteTitle} placeholder="Note title" />
							</label>
							<label class="grid gap-2">
								<span class="text-xs uppercase tracking-[0.24em] text-base-content/45">Kind</span>
								<select class="select select-bordered" bind:value={noteKind}>
									<option value="note">Note</option>
									<option value="doc">Doc</option>
									<option value="decision">Decision</option>
								</select>
							</label>
						{/if}
					{/if}
					{#if error}
						<p class="text-sm text-error">{error}</p>
					{/if}
					<div class="flex justify-end gap-2">
						<button class="btn btn-ghost" onclick={closeModal}>Cancel</button>
						<button
							class="btn btn-primary"
							disabled={
								(modal === 'project' && !projectTitle.trim()) ||
								(modal === 'task' && !taskTitle.trim()) ||
								(modal === 'meeting' && !meetingTitle.trim()) ||
								(modal === 'note' && !noteTitle.trim())
							}
							onclick={modal === 'project' ? submitProject : modal === 'task' ? submitTask : modal === 'meeting' ? submitMeeting : submitNote}
						>
							Create
						</button>
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>
