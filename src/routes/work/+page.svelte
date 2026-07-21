<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import type { TaskStatus } from '$lib/types/models';
	import { formatDate, todayDate } from '$lib/utils/dates';
	import { untrack } from 'svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let view = $state<'now' | 'attention' | 'next' | 'all'>('now');
	let captureText = $state('');
	let selectedProjectId = $state(untrack(() => data.projects[0]?.id ?? ''));
	let pending = $state('');
	let error = $state('');
	const today = todayDate();

	function overdue(task: PageData['tasks'][number]): boolean {
		return Boolean((task.due_at && task.due_at < today) || (task.scheduled_for && task.scheduled_for < today));
	}

	const visibleTasks = $derived(
		data.tasks.filter((task) => {
			if (view === 'now') return task.status === 'in_progress';
			if (view === 'attention') return task.status === 'blocked' || overdue(task);
			if (view === 'next') return task.status === 'todo' && !overdue(task);
			return true;
		})
	);

	async function patchTask(id: string, status: TaskStatus): Promise<void> {
		pending = id;
		error = '';
		const response = await fetch(`/api/tasks/${id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ status })
		});
		pending = '';
		if (!response.ok) { error = 'Task update failed.'; return; }
		await invalidateAll();
	}

	async function capture(): Promise<void> {
		if (!captureText.trim() || pending) return;
		pending = 'capture';
		error = '';
		const response = await fetch('/api/inbox', {
			method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: captureText })
		});
		pending = '';
		if (!response.ok) { error = 'Capture failed.'; return; }
		captureText = '';
		await invalidateAll();
	}

	async function triage(item: PageData['inboxItems'][number], action: 'task' | 'note' | 'discard'): Promise<void> {
		pending = `inbox-${item.lineIndex}`;
		error = '';
		const response = await fetch('/api/inbox', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ ...item, action, projectId: selectedProjectId || undefined })
		});
		const payload = await response.json().catch(() => null);
		pending = '';
		if (!response.ok) { error = payload?.error ?? 'Triage failed.'; return; }
		await invalidateAll();
		if (payload?.href && action === 'note') await goto(payload.href);
	}
</script>

<div class="bp-page">
	<section class="bp-hero pb-4">
		<div class="bp-toolbar">
			<div>
				<p class="bp-kicker">Workbench</p>
				<h1 class="bp-page-title">One working set</h1>
				<p class="bp-copy">Start less. Finish more. Keep every interruption recoverable.</p>
			</div>
			<a class="btn btn-ghost btn-sm" href="/today">Daily log</a>
		</div>
		<div class="bp-stat-grid md:grid-cols-5">
			<div class="bp-stat"><p class="bp-meta">Open</p><p class="bp-stat-value">{data.counts.open}</p></div>
			<div class="bp-stat"><p class="bp-meta">Moving</p><p class="bp-stat-value">{data.counts.inProgress}</p></div>
			<div class="bp-stat" class:has-attention={data.counts.blocked > 0}><p class="bp-meta">Blocked</p><p class="bp-stat-value">{data.counts.blocked}</p></div>
			<div class="bp-stat" class:has-attention={data.counts.overdue > 0}><p class="bp-meta">Overdue</p><p class="bp-stat-value">{data.counts.overdue}</p></div>
			<div class="bp-stat"><p class="bp-meta">Unscheduled</p><p class="bp-stat-value">{data.counts.unscheduled}</p></div>
		</div>
	</section>

	<section class="bp-capture-bar">
		<span class="bp-kicker shrink-0">Quick capture</span>
		<input class="input input-ghost min-w-0 flex-1 border-0 bg-transparent shadow-none" bind:value={captureText} onkeydown={(event) => event.key === 'Enter' && capture()} placeholder="Drop the thought here. Enter to capture." />
		<button class="btn btn-primary btn-sm" onclick={capture} disabled={!captureText.trim() || pending === 'capture'}>Capture</button>
	</section>
	{#if data.counts.inProgress > 3}
		<div class="bp-carryover-bar" role="status">
			<div><strong>WIP is high.</strong> {data.counts.inProgress} tasks are moving. Finish or pause one before pulling more work.</div>
			<button class="btn btn-ghost btn-xs" onclick={() => (view = 'now')}>Review active work</button>
		</div>
	{/if}

	{#if error}<p class="text-sm text-error">{error}</p>{/if}

	<div class="bp-page-grid bp-work-grid">
		<section class="bp-panel overflow-hidden">
			<div class="bp-panel-heading">
				<div class="tabs tabs-boxed">
					<button class="tab" class:tab-active={view === 'now'} onclick={() => (view = 'now')}>Now</button>
					<button class="tab" class:tab-active={view === 'attention'} onclick={() => (view = 'attention')}>Attention</button>
					<button class="tab" class:tab-active={view === 'next'} onclick={() => (view = 'next')}>Next</button>
					<button class="tab" class:tab-active={view === 'all'} onclick={() => (view = 'all')}>All</button>
				</div>
				<span class="bp-pill">{visibleTasks.length}</span>
			</div>

			{#if visibleTasks.length}
				<div class="bp-work-list">
					{#each visibleTasks as task (task.id)}
						<article class="bp-work-row" class:is-overdue={overdue(task)}>
							<button class="bp-task-check" onclick={() => patchTask(task.id, 'done')} aria-label={`Complete ${task.title}`} title="Mark done"></button>
							<div class="min-w-0 flex-1">
								<a class="font-medium text-white hover:text-info" href={`/projects/${task.projectSlug}#task-${task.id}`}>{task.title}</a>
								<div class="mt-2 flex flex-wrap items-center gap-2">
									<span class={`bp-priority-dot ${task.priority}`}></span>
									<span class="bp-meta normal-case">{task.projectTitle}</span>
									<span class="bp-count" class:is-danger={task.status === 'blocked'}>{task.status.replaceAll('_', ' ')}</span>
									{#if task.due_at}<span class="bp-meta normal-case">due {formatDate(task.due_at)}</span>{/if}
								</div>
							</div>
							{#if task.status !== 'in_progress'}
								<button class="btn btn-ghost btn-xs" onclick={() => patchTask(task.id, 'in_progress')} disabled={pending === task.id}>Start</button>
							{:else}<span class="bp-pill bp-pill-blue">Moving</span>{/if}
						</article>
					{/each}
				</div>
			{:else}
				<div class="p-4"><p class="bp-empty">{view === 'now' ? 'Nothing is active. Pull one meaningful next action.' : 'Clear.'}</p></div>
			{/if}
		</section>

		<aside class="grid content-start gap-4">
		<section class="bp-panel overflow-hidden">
			<div class="bp-panel-heading">
				<div><p class="bp-kicker">Triage</p><h2 class="bp-section-title mt-1">Inbox</h2></div>
				<span class="bp-pill">{data.inboxItems.length}</span>
			</div>
			{#if data.inboxItems.length}
				<div class="border-b border-[var(--bp-border)] p-3">
					<select class="select select-bordered w-full" bind:value={selectedProjectId}>
						{#each data.projects as project}<option value={project.id}>{project.title}</option>{/each}
					</select>
				</div>
				<div class="bp-triage-list">
					{#each data.inboxItems as item (item.lineIndex)}
						<div class="bp-triage-row">
							<p class="text-sm leading-6 text-white">{item.text}</p>
							<div class="mt-2 flex flex-wrap gap-2">
								<button class="btn btn-primary btn-xs" onclick={() => triage(item, 'task')} disabled={!selectedProjectId || pending !== ''}>Task</button>
								<button class="btn btn-ghost btn-xs" onclick={() => triage(item, 'note')} disabled={!selectedProjectId || pending !== ''}>Note</button>
								<button class="btn btn-ghost btn-xs" onclick={() => triage(item, 'discard')} disabled={pending !== ''}>Discard</button>
							</div>
						</div>
					{/each}
				</div>
			{:else}<div class="p-4"><p class="bp-empty">Inbox zero. Nothing is waiting to be classified.</p></div>{/if}
		</section>
		{#if data.repositories.length}
			<section class="bp-panel overflow-hidden">
				<div class="bp-panel-heading"><div><p class="bp-kicker">Resume</p><h2 class="bp-section-title mt-1">Repositories</h2></div></div>
				<div class="bp-project-pulse-list">
					{#each data.repositories as item (item.project.id)}
						<a class="bp-project-pulse-row" href={`/projects/${item.project.slug}`}>
							<div class="min-w-0"><p class="truncate font-medium text-white">{item.project.title}</p><p class="bp-meta mt-1 normal-case">{item.status.error ?? item.status.lastCommit}</p></div>
							{#if item.status.isGitRepository}<div class="flex gap-2"><span class="bp-count is-moving">{item.status.branch}</span>{#if item.status.dirtyCount}<span class="bp-count is-danger">{item.status.dirtyCount}</span>{/if}</div>{/if}
						</a>
					{/each}
				</div>
			</section>
		{/if}
		</aside>
	</div>
</div>
