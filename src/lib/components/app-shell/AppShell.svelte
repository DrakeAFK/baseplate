<script lang="ts">
import { goto, invalidateAll } from '$app/navigation';
import { page } from '$app/state';
import type { AppShellData } from '$lib/types/models';
import type { Snippet } from 'svelte';
import CommandPalette from '$lib/components/command-palette/CommandPalette.svelte';

	let { shell, children }: { shell: AppShellData; children: Snippet } = $props();

	let paletteOpen = $state(false);
	let modal = $state<null | 'project' | 'task' | 'meeting' | 'note'>(null);
	let error = $state('');

	let projectTitle = $state('');
	let projectKind = $state<'standard' | 'perpetual'>('standard');
	let projectSummary = $state('');

	let selectedProjectId = $state('');
	let taskTitle = $state('');
	let meetingTitle = $state('');
	let meetingDate = $state(new Date().toISOString().slice(0, 10));
	let noteTitle = $state('');
	let noteKind = $state<'note' | 'doc' | 'decision'>('note');

	$effect(() => {
		if (!selectedProjectId && shell.allProjects[0]?.id) {
			selectedProjectId = shell.allProjects[0].id;
		}
	});

	function openAction(action: string) {
		if (action === 'openCreateProject') modal = 'project';
		if (action === 'openCreateTask') modal = 'task';
		if (action === 'openCreateMeeting') modal = 'meeting';
		if (action === 'openCreateNote') modal = 'note';
	}

	async function submitProject() {
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
		modal = null;
		await goto(`/projects/${payload.project.slug}`);
	}

	async function submitTask() {
		const response = await fetch('/api/tasks', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ projectId: selectedProjectId, title: taskTitle })
		});
		if (!response.ok) {
			error = 'Unable to create task';
			return;
		}
		modal = null;
		await invalidateAll();
	}

	async function submitMeeting() {
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
		modal = null;
		const project = shell.allProjects.find((item) => item.id === selectedProjectId);
		await goto(`/projects/${project?.slug}/meetings/${payload.meeting.id}`);
	}

	async function submitNote() {
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
		modal = null;
		const project = shell.allProjects.find((item) => item.id === selectedProjectId);
		await goto(`/projects/${project?.slug}/notes/${payload.note.id}`);
	}

	function keyHandler(event: KeyboardEvent) {
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
			event.preventDefault();
			paletteOpen = !paletteOpen;
		}
		if (event.key === 'Escape') {
			paletteOpen = false;
			modal = null;
		}
	}

	const navItems = [
		{ href: '/today', label: 'Today' },
		{ href: '/projects', label: 'Projects' },
		{ href: '/search', label: 'Search' },
		{ href: '/inbox', label: 'Inbox' },
		{ href: '/settings', label: 'Settings' }
	];
</script>

<svelte:window onkeydown={keyHandler} />

<div class="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(125,211,252,0.16),_transparent_28%),linear-gradient(180deg,#0b1117_0%,#101720_45%,#0c131b_100%)] text-base-content">
	<div class="mx-auto grid min-h-screen max-w-[1800px] gap-6 px-4 py-4 lg:grid-cols-[280px_minmax(0,1fr)] lg:px-6">
		<aside data-sveltekit-preload-data="off" class="rounded-[2rem] border border-white/10 bg-base-200/55 p-5 shadow-[0_20px_100px_rgba(0,0,0,0.35)]">
			<div class="mb-8 flex items-center justify-between">
				<div>
					<p class="text-xs uppercase tracking-[0.4em] text-base-content/45">Workspace</p>
					<h1 class="text-2xl font-semibold text-white">Baseplate</h1>
				</div>
				<button class="btn btn-primary btn-sm" onclick={() => (modal = 'project')}>New</button>
			</div>

			<nav class="grid gap-2">
				{#each navItems as item}
					<a class={`rounded-2xl px-4 py-3 text-sm transition hover:bg-base-300/60 ${page.url.pathname.startsWith(item.href) ? 'bg-base-300/70' : ''}`} href={item.href}>
						{item.label}
					</a>
				{/each}
			</nav>

			<div class="mt-8 grid gap-3">
				<div class="flex items-center justify-between">
					<p class="text-xs uppercase tracking-[0.3em] text-base-content/45">Active projects</p>
					<a class="text-xs text-base-content/60" href="/projects">View all</a>
				</div>
				{#each shell.activeProjects as project (project.id)}
					<a class="rounded-[1.35rem] border border-white/10 bg-base-300/30 px-4 py-3 transition hover:border-info/40 hover:bg-base-300/60" href={`/projects/${project.slug}`}>
						<div class="flex items-center justify-between gap-3">
							<div>
								<p class="font-medium text-white">{project.title}</p>
								<p class="text-xs text-base-content/55">{project.kind} · {project.status}</p>
							</div>
						</div>
					</a>
				{/each}
			</div>
		</aside>

		<div class="grid min-h-screen grid-rows-[auto_1fr] gap-4">
			<header class="flex flex-wrap items-center justify-between gap-3 rounded-[2rem] border border-white/10 bg-base-200/45 px-5 py-4 shadow-[0_20px_80px_rgba(0,0,0,0.18)]">
				<button class="flex min-w-[22rem] items-center justify-between rounded-[1.4rem] border border-white/10 bg-base-300/25 px-4 py-3 text-left text-sm text-base-content/60" onclick={() => (paletteOpen = true)}>
					<span>Jump anywhere, create anything</span>
					<kbd class="kbd kbd-sm border-white/10 bg-base-300/60">Ctrl K</kbd>
				</button>
				<div class="flex items-center gap-2">
					<button class="btn btn-ghost btn-sm" onclick={() => (modal = 'task')}>Task</button>
					<button class="btn btn-ghost btn-sm" onclick={() => (modal = 'meeting')}>Meeting</button>
					<button class="btn btn-ghost btn-sm" onclick={() => (modal = 'note')}>Note</button>
				</div>
			</header>

			<main class="pb-6">
				{@render children()}
			</main>
		</div>
	</div>

	<CommandPalette open={paletteOpen} items={shell.commandPaletteItems} onClose={() => (paletteOpen = false)} onAction={openAction} />

	{#if modal}
		<div class="fixed inset-0 z-40 bg-neutral/60 p-4 backdrop-blur-sm" role="button" tabindex="0" onclick={() => (modal = null)} onkeydown={(event) => event.key === 'Escape' && (modal = null)}>
			<div class="mx-auto mt-16 max-w-xl rounded-[2rem] border border-white/10 bg-base-100 p-6 shadow-[0_30px_120px_rgba(0,0,0,0.4)]" role="presentation" onclick={(event) => event.stopPropagation()}>
				<h2 class="text-2xl font-semibold text-white">
					{modal === 'project' ? 'Create project' : modal === 'task' ? 'Create task' : modal === 'meeting' ? 'Create meeting' : 'Create note'}
				</h2>
				<div class="mt-5 grid gap-4">
					{#if modal === 'project'}
						<input class="input input-bordered" bind:value={projectTitle} placeholder="Project title" />
						<select class="select select-bordered" bind:value={projectKind}>
							<option value="standard">Standard</option>
							<option value="perpetual">Perpetual</option>
						</select>
						<textarea class="textarea textarea-bordered min-h-28" bind:value={projectSummary} placeholder="Summary"></textarea>
					{:else}
						<select class="select select-bordered" bind:value={selectedProjectId}>
							{#each shell.allProjects as project}
								<option value={project.id}>{project.title}</option>
							{/each}
						</select>
						{#if modal === 'task'}
							<input class="input input-bordered" bind:value={taskTitle} placeholder="Task title" />
						{:else if modal === 'meeting'}
							<input class="input input-bordered" bind:value={meetingTitle} placeholder="Meeting title" />
							<input class="input input-bordered" type="date" bind:value={meetingDate} />
						{:else}
							<input class="input input-bordered" bind:value={noteTitle} placeholder="Note title" />
							<select class="select select-bordered" bind:value={noteKind}>
								<option value="note">Note</option>
								<option value="doc">Doc</option>
								<option value="decision">Decision</option>
							</select>
						{/if}
					{/if}
					{#if error}
						<p class="text-sm text-error">{error}</p>
					{/if}
					<div class="flex justify-end gap-2">
						<button class="btn btn-ghost" onclick={() => (modal = null)}>Cancel</button>
						<button
							class="btn btn-primary"
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
