<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import CommandPalette from '$lib/components/command-palette/CommandPalette.svelte';
	import Logo from '$lib/assets/baseplate.svg';
	import { todayDate } from '$lib/utils/dates';
	import { slide } from 'svelte/transition';
	import type { Snippet } from 'svelte';
	import type { AppShellData, TaskPriority, TaskStatus, Project, ProjectWithCounts } from '$lib/types/models';

	type Modal = 'project' | 'task' | 'meeting' | 'note';

	let { shell, children }: { shell: AppShellData; children: Snippet } = $props();

	let paletteOpen = $state(false);
	let modal = $state<Modal | null>(null);
	let mobileNavOpen = $state(false);
	let error = $state('');

	/* ── Collapsed state per project ── */
	let collapsed = $state<Record<string, boolean>>({});

	function toggleProject(id: string): void {
		collapsed[id] = !collapsed[id];
	}

	/* ── Form state (reused from original) ── */
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

	/* ── Nav helpers ── */
	const railItems = [
		{ href: '/today', icon: '◉', label: 'Today' },
		{ href: '/projects', icon: '▦', label: 'Projects' },
		{ href: '/search', icon: '⌕', label: 'Search' },
		{ href: '/inbox', icon: '▤', label: 'Inbox' },
		{ href: '/settings', icon: '⚙', label: 'Settings' }
	];

	const currentPath = $derived(page.url.pathname);

	function routeMatches(href: string): boolean {
		return currentPath === href || currentPath.startsWith(`${href}/`);
	}

	function isProjectActive(slug: string): boolean {
		return currentPath.startsWith(`/projects/${slug}`);
	}

	/* ── Derive current page context for header ── */
	const headerContext = $derived.by(() => {
		for (const item of railItems) {
			if (routeMatches(item.href)) return { label: item.label, sub: '' };
		}
		const slug = currentPath.startsWith('/projects/') ? currentPath.split('/')[2] : null;
		if (slug) {
			const project = shell.allProjects.find((p: Project) => p.slug === slug);
			if (project) {
				const section = currentPath.split('/')[3];
				const sub = section === 'meetings' ? 'Meetings' : section === 'notes' ? 'Notes' : '';
				return { label: project.title, sub };
			}
		}
		if (currentPath === '/projects') return { label: 'Projects', sub: '' };
		if (currentPath === '/notes') return { label: 'Notes', sub: '' };
		return { label: 'Workspace', sub: '' };
	});

	/* ── Project context for forms ── */
	function currentProjectId(): string {
		const slug = currentPath.startsWith('/projects/') ? currentPath.split('/')[2] : null;
		return shell.allProjects.find((p: Project) => p.slug === slug)?.id ?? shell.allProjects[0]?.id ?? '';
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
		error = '';
	}

	function openModal(next: Modal, forProjectId?: string): void {
		error = '';
		if (next === 'project') resetProjectForm();
		if (next === 'task') { resetTaskForm(); if (forProjectId) selectedProjectId = forProjectId; }
		if (next === 'meeting') { resetMeetingForm(); if (forProjectId) selectedProjectId = forProjectId; }
		if (next === 'note') { resetNoteForm(); if (forProjectId) selectedProjectId = forProjectId; }
		modal = next;
	}

	function openAction(action: string): void {
		if (action === 'openCreateProject') openModal('project');
		if (action === 'openCreateTask') openModal('task');
		if (action === 'openCreateMeeting') openModal('meeting');
		if (action === 'openCreateNote') openModal('note');
	}

	$effect(() => {
		if (!selectedProjectId) selectedProjectId = currentProjectId();
	});

	$effect(() => {
		// Close mobile nav on route change
		const _current = page.url.pathname;
		mobileNavOpen = false;
	});

	/* ── API submissions (unchanged logic) ── */
	async function submitProject(): Promise<void> {
		const response = await fetch('/api/projects', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ title: projectTitle, kind: projectKind, summary: projectSummary })
		});
		const payload = await response.json();
		if (!response.ok) { error = payload.error ?? 'Unable to create project'; return; }
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
		if (!response.ok) { error = payload?.error ?? 'Unable to create task'; return; }
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
		if (!response.ok) { error = payload.error ?? 'Unable to create meeting'; return; }
		const project = shell.allProjects.find((p: Project) => p.id === selectedProjectId);
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
		if (!response.ok) { error = payload.error ?? 'Unable to create note'; return; }
		const project = shell.allProjects.find((p: Project) => p.id === selectedProjectId);
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

<div class="bp-shell" class:is-mobile-nav-open={mobileNavOpen}>
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="bp-mobile-overlay" onclick={() => (mobileNavOpen = false)}></div>

	<!-- ═══ Rail ═══ -->
	<nav class="bp-rail" aria-label="Main navigation">
		<a class="bp-rail-logo" href="/today" title="baseplate.">
			<img src={Logo} alt="Baseplate" />
		</a>

		<div class="bp-rail-divider"></div>

		{#each railItems as item}
			<a
				class={`bp-rail-icon ${routeMatches(item.href) ? 'is-active' : ''}`}
				href={item.href}
				title={item.label}
				aria-current={routeMatches(item.href) ? 'page' : undefined}
			>
				{item.icon}
			</a>
		{/each}

		<div class="bp-rail-spacer"></div>

		<button
			class="bp-rail-icon"
			title="Quick create (Ctrl+K)"
			onclick={() => (paletteOpen = true)}
		>
			⌘
		</button>
	</nav>

	<!-- ═══ Channel Panel ═══ -->
	<aside class="bp-channels" data-sveltekit-preload-data="off">
		<div class="bp-channels-header">
			<h2>Workspace</h2>
			<button
				class="bp-channel-group-action"
				title="New project"
				onclick={() => openModal('project')}
			>
				+
			</button>
		</div>

		<div class="bp-channels-body">
			<!-- Search trigger -->
			<div class="bp-channel-meta" style="padding-bottom: 0.25rem;">
				<button class="bp-channel-search" onclick={() => (paletteOpen = true)}>
					<span>⌕</span>
					<span>Search / jump</span>
					<kbd class="kbd kbd-xs">⌘K</kbd>
				</button>
			</div>

			<!-- Meta nav items -->
			<div class="bp-channel-meta">
				<a class={`bp-channel-meta-item ${routeMatches('/notes') && !currentPath.startsWith('/projects') ? 'is-active' : ''}`} href="/notes">
					<span>📄</span>
					<span>All Notes</span>
				</a>
			</div>

			<div class="bp-channel-divider"></div>

			<!-- Project groups -->
			{#each shell.activeProjects as project (project.id)}
				<div class="bp-channel-group">
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="bp-channel-group-header"
						onclick={() => toggleProject(project.id)}
					>
						<span class={`bp-chevron ${collapsed[project.id] ? 'is-collapsed' : ''}`}>▾</span>
						<span>{project.title}</span>
						<span class="bp-group-actions">
							<button
								class="bp-channel-group-action"
								title="Add task"
								onclick={(e) => { e.stopPropagation(); openModal('task', project.id); }}
							>+</button>
						</span>
					</div>

					{#if !collapsed[project.id]}
						<div class="bp-channel-group-items" transition:slide={{ duration: 180 }}>
							<a
								class={`bp-channel-item ${isProjectActive(project.slug) && !currentPath.includes('/notes/') && !currentPath.includes('/meetings/') ? 'is-active' : ''}`}
								href={`/projects/${project.slug}`}
							>
								<span class="bp-channel-icon">▦</span>
								<span>Overview</span>
								{#if project.openTaskCount > 0}
									<span class="bp-channel-count">{project.openTaskCount}</span>
								{/if}
							</a>
							<a
								class={`bp-channel-item ${isProjectActive(project.slug) && currentPath.includes('/notes/') ? 'is-active' : ''}`}
								href={`/projects/${project.slug}#notes`}
							>
								<span class="bp-channel-icon">✎</span>
								<span>Notes</span>
								{#if project.noteCount > 0}
									<span class="bp-channel-count">{project.noteCount}</span>
								{/if}
							</a>
							<a
								class={`bp-channel-item ${isProjectActive(project.slug) && currentPath.includes('/meetings/') ? 'is-active' : ''}`}
								href={`/projects/${project.slug}#meetings`}
							>
								<span class="bp-channel-icon">◎</span>
								<span>Meetings</span>
								{#if project.meetingCount > 0}
									<span class="bp-channel-count">{project.meetingCount}</span>
								{/if}
							</a>
						</div>
					{/if}
				</div>
			{/each}

			{#if !shell.activeProjects.length}
				<div class="bp-channel-meta">
					<p style="padding: 0.5rem 0.6rem; color: var(--bp-faint); font-size: 0.78rem;">
						No active projects yet. Create one to get started.
					</p>
				</div>
			{/if}
		</div>

		<div class="bp-channels-footer">
			<button
				class="btn btn-primary btn-sm w-full"
				onclick={() => openModal('project')}
			>
				New project
			</button>
		</div>
	</aside>

	<!-- ═══ Main Content ═══ -->
	<div class="bp-main">
		<header class="bp-main-header">
			<div class="bp-main-header-title">
				<button
					class="bp-mobile-toggle btn btn-ghost btn-sm px-1 md:hidden"
					onclick={() => (mobileNavOpen = !mobileNavOpen)}
					aria-label="Toggle navigation"
				>
					{mobileNavOpen ? '✕' : '☰'}
				</button>
				{#if headerContext.sub}
					<span class="bp-breadcrumb">{headerContext.label} /</span>
					<h2>{headerContext.sub}</h2>
				{:else}
					<h2>{headerContext.label}</h2>
				{/if}
			</div>
			<div class="bp-main-header-actions">
				<button class="btn btn-ghost btn-sm" onclick={() => openModal('task')}>New task</button>
				<button class="btn btn-ghost btn-sm" onclick={() => openModal('meeting')}>Meeting</button>
				<button class="btn btn-ghost btn-sm" onclick={() => openModal('note')}>Note</button>
			</div>
		</header>

		<main class="bp-main-body">
			{@render children()}
		</main>
	</div>
</div>

<!-- ═══ Command Palette ═══ -->
<CommandPalette open={paletteOpen} items={shell.commandPaletteItems} onClose={() => (paletteOpen = false)} onAction={openAction} />

<!-- ═══ Quick-Create Modal ═══ -->
{#if modal}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-40 bg-[rgba(7,8,12,0.76)] p-4 backdrop-blur-sm"
		role="button"
		tabindex="0"
		onclick={closeModal}
		onkeydown={(event) => event.key === 'Escape' && closeModal()}
	>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
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
