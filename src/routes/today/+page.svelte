<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import MarkdownEditor from '$lib/components/editor/MarkdownEditor.svelte';
	import type { TaskStatus } from '$lib/types/models';
	import { formatDate, formatRelative, todayDate } from '$lib/utils/dates';
	import { untrack } from 'svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let dashboard = $state(untrack(() => data));
	let pendingTaskId = $state<string | null>(null);
	let carryoverSaving = $state(false);
	let actionError = $state('');
	const today = todayDate();

	$effect(() => {
		dashboard = data;
	});

	const overdueCount = $derived(dashboard.todayTasks.filter((task) => isOverdue(task)).length);
	const movingCount = $derived(dashboard.todayTasks.filter((task) => task.status === 'in_progress').length);
	const blockedCount = $derived(dashboard.todayTasks.filter((task) => task.status === 'blocked').length);
	const projectOpenCount = $derived(dashboard.activeProjects.reduce((sum, project) => sum + project.openTaskCount, 0));

	function isOverdue(task: PageData['todayTasks'][number]): boolean {
		return Boolean((task.due_at && task.due_at < today) || (task.scheduled_for && task.scheduled_for < today));
	}

	function queueReason(task: PageData['todayTasks'][number]): string {
		if (task.due_at && task.due_at < today) return `overdue ${formatDate(task.due_at)}`;
		if (task.scheduled_for && task.scheduled_for < today) return `planned ${formatDate(task.scheduled_for)}`;
		if (task.due_at === today) return 'due today';
		if (task.scheduled_for === today) return 'planned today';
		return task.status.replaceAll('_', ' ');
	}

	async function updateTask(taskId: string, status: TaskStatus): Promise<void> {
		if (pendingTaskId) return;
		pendingTaskId = taskId;
		actionError = '';
		const response = await fetch(`/api/tasks/${taskId}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ status })
		});
		pendingTaskId = null;
		if (!response.ok) {
			actionError = 'Task change did not save. Try again.';
			return;
		}
		await invalidateAll();
	}

	async function syncCarryover(): Promise<void> {
		if (carryoverSaving) return;
		carryoverSaving = true;
		actionError = '';
		const response = await fetch(`/api/notes/${dashboard.daily.note.id}/carryover`, { method: 'POST' });
		const payload = await response.json().catch(() => null);
		carryoverSaving = false;
		if (!response.ok) {
			actionError = payload?.error ?? 'Unable to carry items forward.';
			return;
		}
		if (payload?.document) dashboard = { ...dashboard, daily: payload.document };
		await invalidateAll();
	}
</script>

<div class="bp-page bp-today-page">
	<section class="bp-hero pb-4">
		<div class="bp-toolbar">
			<div>
				<p class="bp-kicker">Daily command center</p>
				<h1 class="bp-page-title">{formatDate(dashboard.dailyMeta.note_date)}</h1>
				<p class="bp-copy">Write freely. Keep the execution queue honest. Carry forward only what still matters.</p>
			</div>
			{#if dashboard.yesterdayNote}
				<a class="btn btn-ghost btn-sm" href={`/notes/daily/${dashboard.yesterdayNote.date}`}>
					Previous daily
				</a>
			{/if}
		</div>

		<div class="bp-stat-grid md:grid-cols-4">
			<div class="bp-stat" class:has-attention={overdueCount > 0}>
				<p class="bp-meta">Overdue</p>
				<p class="bp-stat-value">{overdueCount}</p>
			</div>
			<div class="bp-stat">
				<p class="bp-meta">In progress</p>
				<p class="bp-stat-value">{movingCount}</p>
			</div>
			<div class="bp-stat" class:has-attention={blockedCount > 0}>
				<p class="bp-meta">Blocked</p>
				<p class="bp-stat-value">{blockedCount}</p>
			</div>
			<div class="bp-stat">
				<p class="bp-meta">Open across projects</p>
				<p class="bp-stat-value">{projectOpenCount}</p>
			</div>
		</div>
	</section>
	{#if dashboard.daily.missing}<div class="bp-carryover-bar border-error/40"><p class="text-sm text-error">Today’s canonical Markdown file is missing. The indexed record is preserved for recovery.</p></div>{/if}

	{#if dashboard.carryover}
		<section class="bp-carryover-bar">
			<div class="min-w-0">
				<p class="bp-kicker">Continuity from {formatDate(dashboard.carryover.sourceDate)}</p>
				<p class="mt-1 text-sm text-base-content/70">
					{dashboard.carryover.importedCount > 0
						? `${dashboard.carryover.importedCount} item${dashboard.carryover.importedCount === 1 ? '' : 's'} carried into the note. Check, rewrite, or delete them as you plan.`
						: dashboard.carryover.availableCount > 0
							? `${dashboard.carryover.availableCount} unfinished item${dashboard.carryover.availableCount === 1 ? '' : 's'} can be pulled forward.`
							: 'The previous daily has no unfinished checklist items.'}
				</p>
			</div>
			{#if dashboard.carryover.availableCount > dashboard.carryover.importedCount}
				<button class="btn btn-primary btn-sm shrink-0" onclick={syncCarryover} disabled={carryoverSaving}>
					{carryoverSaving ? 'Syncing...' : 'Carry forward'}
				</button>
			{:else if dashboard.carryover.importedCount > 0}
				<span class="bp-pill bp-pill-green shrink-0">Ready to prune</span>
			{/if}
		</section>
	{/if}

	{#if actionError}
		<p class="text-sm text-error">{actionError}</p>
	{/if}

	<div class="bp-page-grid bp-today-grid">
		<MarkdownEditor
			value={dashboard.daily.body}
			saveUrl={`/api/notes/${dashboard.daily.note.id}/content`}
			previewHtml={dashboard.daily.html}
			label="Daily log"
			onSaved={(payload) => {
				if (payload && typeof payload === 'object' && 'document' in payload) {
					dashboard = { ...dashboard, daily: payload.document as PageData['daily'] };
				}
			}}
		/>

		<aside class="grid content-start gap-4">
			<section class="bp-panel min-w-0 overflow-hidden">
				<div class="bp-panel-heading">
					<div>
						<p class="bp-kicker">Execution queue</p>
						<h2 class="bp-section-title mt-1">Now and overdue</h2>
					</div>
					<span class="bp-pill bp-pill-blue">{dashboard.todayTasks.length}</span>
				</div>

				{#if dashboard.todayTasks.length}
					<div class="bp-focus-list">
						{#each dashboard.todayTasks as task (task.id)}
							<article class="bp-focus-task" class:is-overdue={isOverdue(task)}>
								<div class="flex min-w-0 items-start gap-3">
									<button
										class="bp-task-check"
										onclick={() => updateTask(task.id, 'done')}
										disabled={pendingTaskId === task.id}
										aria-label={`Complete ${task.title}`}
										title="Mark done"
									></button>
									<div class="min-w-0 flex-1">
										<a class="block font-medium leading-snug text-white hover:text-info" href={`/projects/${task.projectSlug}#task-${task.id}`}>
											{task.title}
										</a>
										<div class="mt-2 flex flex-wrap items-center gap-2">
											<span class={`bp-priority-dot ${task.priority}`}></span>
											<span class="bp-meta normal-case">{task.projectTitle}</span>
											<span class:is-overdue-label={isOverdue(task)} class="bp-meta normal-case">{queueReason(task)}</span>
										</div>
									</div>
								</div>
								{#if task.status !== 'in_progress'}
									<button class="btn btn-ghost btn-xs" onclick={() => updateTask(task.id, 'in_progress')} disabled={pendingTaskId !== null}>
										Start
									</button>
								{:else}
									<span class="bp-pill bp-pill-blue">Moving</span>
								{/if}
							</article>
						{/each}
					</div>
				{:else}
					<div class="p-4"><p class="bp-empty">Queue clear. Pull the next meaningful task when you are ready.</p></div>
				{/if}
			</section>

			<section class="bp-panel min-w-0 overflow-hidden">
				<div class="bp-panel-heading">
					<div>
						<p class="bp-kicker">Active systems</p>
						<h2 class="bp-section-title mt-1">Project pulse</h2>
					</div>
					<a class="btn btn-ghost btn-xs" href="/projects">All</a>
				</div>
				<div class="bp-project-pulse-list">
					{#if dashboard.activeProjects.length}
						{#each dashboard.activeProjects as project (project.id)}
							<a class="bp-project-pulse-row" href={`/projects/${project.slug}`}>
								<div class="min-w-0">
									<p class="truncate font-medium text-white">{project.title}</p>
									<p class="bp-meta mt-1 normal-case">Updated {formatRelative(project.updated_at)}</p>
								</div>
								<div class="flex items-center gap-2">
									{#if project.blockedTaskCount > 0}<span class="bp-count is-danger">{project.blockedTaskCount} blocked</span>{/if}
									<span class="bp-count">{project.openTaskCount} open</span>
								</div>
							</a>
						{/each}
					{:else}
						<div class="p-4"><p class="bp-empty">No active projects. Start one when the work deserves a durable home.</p></div>
					{/if}
				</div>
			</section>
		</aside>
	</div>
</div>
