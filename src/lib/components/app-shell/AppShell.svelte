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
		{ href: '/today', label: 'Today', description: 'Daily focus' },
		{ href: '/projects', label: 'Projects', description: 'Durable workspaces' },
		{ href: '/notes', label: 'Notes', description: 'Docs and decisions' },
		{ href: '/search', label: 'Search', description: 'Find anything' },
		{ href: '/inbox', label: 'Inbox', description: 'Quick capture' },
		{ href: '/settings', label: 'Settings', description: 'Workspace controls' }
	];
	const currentNav = $derived(
		navItems.find((item) => page.url.pathname === item.href || page.url.pathname.startsWith(`${item.href}/`)) ?? {
			href: '/',
			label: 'Workspace',
			description: 'Command center'
		}
	);
	const snapshotTiles = $derived([
		{ label: 'Projects', value: shell.snapshot.projectCount },
		{ label: 'Open tasks', value: shell.snapshot.openTaskCount },
		{ label: 'Notes', value: shell.snapshot.noteCount },
		{ label: 'Meetings', value: shell.snapshot.meetingCount }
	]);
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

	function routeMatches(href: string): boolean {
		return page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
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

<div class="min-h-screen text-base-content">
	<div class="mx-auto grid min-h-screen max-w-[1720px] gap-4 px-3 py-3 lg:grid-cols-[336px_minmax(0,1fr)]">
		<aside data-sveltekit-preload-data="off" class="bp-shell-sidebar lg:sticky lg:top-3 lg:max-h-[calc(100vh-1.5rem)]">
			<div class="grid h-full lg:grid-cols-[72px_minmax(0,1fr)]">
				<div class="bp-shell-rail flex flex-col items-center gap-3 px-3 py-4">
					<div class="flex h-11 w-11 items-center justify-center rounded-[0.95rem] border border-[rgba(255,255,255,0.08)] bg-[#1d2128]">
						<img src={Logo} alt="Baseplate" class="w-6 h-auto" />
					</div>
					<button class="btn btn-primary h-11 w-11 p-0 text-lg" aria-label="Create project" onclick={() => openModal('project')}>+</button>
					<div class="bp-keyline my-1 w-full"></div>
					<nav class="grid gap-2">
						{#each navItems as item}
							<a
								class={`bp-rail-link ${routeMatches(item.href) ? 'is-active' : ''}`}
								aria-current={routeMatches(item.href) ? 'page' : undefined}
								href={item.href}
								title={item.label}
							>
								{item.label.slice(0, 1)}
							</a>
						{/each}
					</nav>
				</div>

				<div class="bp-shell-navpanel flex flex-col gap-4 px-4 py-4">
					<div class="flex items-start justify-between gap-3">
						<div>
							<p class="bp-kicker">Workspace</p>
							<h1 class="mt-2 text-[1.08rem] font-semibold text-white">baseplate.</h1>
							<p class="mt-1 text-sm text-base-content/48">Projects, notes, tasks</p>
						</div>
						<button class="btn btn-ghost btn-xs" onclick={() => openModal('project')}>New</button>
					</div>

					<button class="bp-search-trigger" onclick={() => (paletteOpen = true)}>
						<span>Search or jump</span>
						<kbd class="kbd kbd-sm">Ctrl K</kbd>
					</button>

					<div class="bp-keyline"></div>

					<div class="grid gap-2">
						<div class="flex items-center justify-between gap-3">
							<p class="bp-meta">Active projects</p>
							<a class="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-base-content/45 hover:text-base-content/70" href="/projects">
								All
							</a>
						</div>
						<div class="bp-list max-h-[40vh] overflow-auto pr-1">
							{#if shell.activeProjects.length}
								{#each shell.activeProjects.slice(0, 8) as project}
									<a
										class={`bp-list-card ${page.url.pathname.startsWith(`/projects/${project.slug}`) ? 'border-primary/35 bg-[#2a2e37]' : ''}`}
										href={`/projects/${project.slug}`}
									>
										<div class="flex items-start justify-between gap-3">
											<div class="min-w-0">
												<p class="truncate text-sm font-semibold text-white">{project.title}</p>
												{#if project.summary}
													<p class="mt-1 truncate text-xs text-base-content/48">{project.summary}</p>
												{/if}
											</div>
											<span class="badge badge-outline">{project.kind}</span>
										</div>
									</a>
								{/each}
							{:else}
								<p class="bp-empty text-sm">No active projects yet.</p>
							{/if}
						</div>
					</div>

					<div class="bp-keyline"></div>

					<div class="grid gap-2">
						<p class="bp-meta">Workspace pulse</p>
						<div class="bp-list">
							{#each shell.pulseCollections as collection}
								<button
									type="button"
									class="bp-list-card text-left"
									aria-haspopup="dialog"
									onclick={() => openPulse(collection.key)}
								>
									<div class="flex items-center justify-between gap-3">
										<p class="text-sm font-semibold text-white">{collection.label}</p>
										<span class="bp-pill">{collection.count}</span>
									</div>
									<p class="mt-1 text-xs text-base-content/48">{collection.summary}</p>
								</button>
							{/each}
						</div>
					</div>

					<div class="mt-auto bp-stat-grid grid-cols-2">
						{#each snapshotTiles as tile}
							<div class="bp-stat">
								<p class="bp-meta">{tile.label}</p>
								<p class="bp-stat-value">{tile.value}</p>
							</div>
						{/each}
					</div>
				</div>
			</div>
		</aside>

		<div class="grid min-h-screen gap-4 lg:grid-rows-[auto_1fr]">
			<header class="bp-shell-topbar px-4 py-4 md:px-5">
				<div class="bp-toolbar">
					<div class="grid gap-1">
						<p class="bp-meta">Workspace / {currentNav.label}</p>
						<div class="flex flex-wrap items-center gap-3">
							<h2 class="text-[1.35rem] font-semibold text-white">{currentNav.label}</h2>
							<div class="bp-inline-stats">
								<span class="bp-pill">{shell.snapshot.openTaskCount} open tasks</span>
								<span class="bp-pill">{shell.snapshot.projectCount} projects</span>
								<span class="bp-pill">{shell.snapshot.noteCount} notes</span>
							</div>
						</div>
					</div>

					<div class="bp-toolbar-group">
						<button class="btn btn-ghost btn-sm" onclick={() => (paletteOpen = true)}>Search</button>
						<button class="btn btn-primary btn-sm" onclick={() => openModal('task')}>New task</button>
						<button class="btn btn-ghost btn-sm" onclick={() => openModal('meeting')}>Meeting</button>
						<button class="btn btn-ghost btn-sm" onclick={() => openModal('note')}>Note</button>
					</div>
				</div>
			</header>

			<main class="bp-shell-content overflow-auto p-4 md:p-5 xl:p-6">
				{@render children()}
			</main>
		</div>
	</div>

	<CommandPalette open={paletteOpen} items={shell.commandPaletteItems} onClose={() => (paletteOpen = false)} onAction={openAction} />

	{#if activePulse}
		<div
			class="fixed inset-0 z-40 bg-[rgba(7,8,12,0.76)] p-4 backdrop-blur-sm"
			role="button"
			tabindex="0"
			onclick={closeModal}
			onkeydown={(event) => event.key === 'Escape' && closeModal()}
		>
			<div class="bp-panel mx-auto mt-8 max-w-5xl p-6" role="presentation" onclick={(event) => event.stopPropagation()}>
				<div class="bp-toolbar">
					<div>
						<p class="bp-kicker">Workspace pulse</p>
						<h2 class="mt-2 text-[1.5rem] font-semibold text-white">{activePulse.label}</h2>
						<p class="mt-2 text-sm text-base-content/58">{activePulse.description}</p>
					</div>
					<button type="button" class="btn btn-ghost btn-sm" onclick={closeModal}>Close</button>
				</div>

				{#if activePulse.rows.length}
					<div class="mt-5 overflow-hidden rounded-[0.95rem] border border-[rgba(255,255,255,0.08)] bg-[#1b1f26]">
						<div class="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_10rem] gap-4 border-b border-[rgba(255,255,255,0.08)] px-4 py-3 text-xs uppercase tracking-[0.18em] text-base-content/45">
							{#each activePulse.columns as heading}
								<p>{heading}</p>
							{/each}
						</div>
						<div class="max-h-[68vh] divide-y divide-[rgba(255,255,255,0.08)] overflow-auto">
							{#each activePulse.rows as row}
								<div class="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_10rem] gap-4 px-4 py-3 text-sm">
									<div class="min-w-0">
										<a class="block truncate font-medium text-white hover:text-info" href={row.href ?? '#'} onclick={closeModal}>
											{row.primary}
										</a>
									</div>
									<p class="truncate text-base-content/58">{row.secondary}</p>
									<p class="text-base-content/52">{row.tertiary}</p>
								</div>
							{/each}
						</div>
					</div>
				{:else}
					<p class="bp-empty mt-5">{activePulse.emptyMessage}</p>
				{/if}
			</div>
		</div>
	{/if}

	{#if modal}
		<div
			class="fixed inset-0 z-40 bg-[rgba(7,8,12,0.76)] p-4 backdrop-blur-sm"
			role="button"
			tabindex="0"
			onclick={closeModal}
			onkeydown={(event) => event.key === 'Escape' && closeModal()}
		>
			<div class="bp-panel mx-auto mt-8 max-w-2xl p-6" role="presentation" onclick={(event) => event.stopPropagation()}>
				<div class="bp-toolbar">
					<div>
						<p class="bp-kicker">Quick create</p>
						<h2 class="mt-2 text-[1.5rem] font-semibold text-white">
							{modal === 'project' ? 'Create project' : modal === 'task' ? 'Create task' : modal === 'meeting' ? 'Create meeting' : 'Create note'}
						</h2>
					</div>
					<button type="button" class="btn btn-ghost btn-sm" onclick={closeModal}>Close</button>
				</div>

				<div class="mt-5 grid gap-4">
					{#if modal === 'project'}
						<label class="grid gap-2">
							<span class="bp-meta">Title</span>
							<input class="input input-bordered" bind:value={projectTitle} placeholder="Project title" />
						</label>
						<div class="grid gap-4 md:grid-cols-[13rem_minmax(0,1fr)]">
							<label class="grid gap-2">
								<span class="bp-meta">Kind</span>
								<select class="select select-bordered" bind:value={projectKind}>
									<option value="standard">Standard</option>
									<option value="perpetual">Perpetual</option>
								</select>
							</label>
							<label class="grid gap-2">
								<span class="bp-meta">Summary</span>
								<textarea class="textarea textarea-bordered min-h-28" bind:value={projectSummary} placeholder="Scope, owner, and current direction"></textarea>
							</label>
						</div>
					{:else}
						<label class="grid gap-2">
							<span class="bp-meta">Project</span>
							<select class="select select-bordered" bind:value={selectedProjectId}>
								{#each shell.allProjects as project}
									<option value={project.id}>{project.title}</option>
								{/each}
							</select>
						</label>
						{#if modal === 'task'}
							<label class="grid gap-2">
								<span class="bp-meta">Title</span>
								<input class="input input-bordered" bind:value={taskTitle} placeholder="Task title" />
							</label>
							<label class="grid gap-2">
								<span class="bp-meta">Working notes</span>
								<textarea class="textarea textarea-bordered min-h-28" bind:value={taskDescription} placeholder="Context, blockers, or links"></textarea>
							</label>
							<div class="grid gap-4 md:grid-cols-4">
								<label class="grid gap-2">
									<span class="bp-meta">Status</span>
									<select class="select select-bordered" bind:value={taskStatus}>
										<option value="todo">todo</option>
										<option value="in_progress">in progress</option>
										<option value="blocked">blocked</option>
										<option value="done">done</option>
										<option value="cancelled">cancelled</option>
									</select>
								</label>
								<label class="grid gap-2">
									<span class="bp-meta">Priority</span>
									<select class="select select-bordered" bind:value={taskPriority}>
										<option value="low">low</option>
										<option value="medium">medium</option>
										<option value="high">high</option>
										<option value="urgent">urgent</option>
									</select>
								</label>
								<label class="grid gap-2">
									<span class="bp-meta">Scheduled</span>
									<input class="input input-bordered" type="date" bind:value={taskScheduledFor} />
								</label>
								<label class="grid gap-2">
									<span class="bp-meta">Due</span>
									<input class="input input-bordered" type="date" bind:value={taskDueAt} />
								</label>
							</div>
						{:else if modal === 'meeting'}
							<label class="grid gap-2">
								<span class="bp-meta">Title</span>
								<input class="input input-bordered" bind:value={meetingTitle} placeholder="Meeting title" />
							</label>
							<label class="grid gap-2">
								<span class="bp-meta">Date</span>
								<input class="input input-bordered" type="date" bind:value={meetingDate} />
							</label>
						{:else}
							<label class="grid gap-2">
								<span class="bp-meta">Title</span>
								<input class="input input-bordered" bind:value={noteTitle} placeholder="Note title" />
							</label>
							<label class="grid gap-2">
								<span class="bp-meta">Kind</span>
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

					<div class="flex justify-end gap-2 pt-1">
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
