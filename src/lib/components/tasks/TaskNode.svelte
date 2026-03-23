<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { Project, TaskPriority, TaskStatus, TaskTreeItem } from '$lib/types/models';
	import { cn } from '$lib/utils/cn';
	import { formatDate, formatRelative } from '$lib/utils/dates';
	import { untrack } from 'svelte';
	import TaskComposer from './TaskComposer.svelte';
	import TaskNode from './TaskNode.svelte';

	let {
		item,
		project,
		depth = 0,
		highlightedTaskId = null
	}: {
		item: TaskTreeItem;
		project: Project;
		depth?: number;
		highlightedTaskId?: string | null;
	} = $props();

	const statusOptions: TaskStatus[] = ['todo', 'in_progress', 'blocked', 'done', 'cancelled'];
	const priorityOptions: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];
	const statusLabels: Record<TaskStatus, string> = {
		todo: 'Ready',
		in_progress: 'In progress',
		blocked: 'Blocked',
		done: 'Done',
		cancelled: 'Cancelled'
	};

	let title = $state(untrack(() => item.title));
	let description = $state(untrack(() => item.description_md));
	let status = $state<TaskStatus>(untrack(() => item.status));
	let priority = $state<TaskPriority>(untrack(() => item.priority));
	let scheduledFor = $state(untrack(() => item.scheduled_for ?? ''));
	let dueAt = $state(untrack(() => item.due_at ?? ''));
	let syncedAt = $state(untrack(() => item.updated_at));
	let detailsOpen = $state(false);
	let subtaskComposerOpen = $state(false);
	let saveState = $state<'idle' | 'saving' | 'error'>('idle');

	const isHighlighted = $derived(item.id === highlightedTaskId);
	const dirty = $derived(
		title !== item.title ||
			description !== item.description_md ||
			status !== item.status ||
			priority !== item.priority ||
			scheduledFor !== (item.scheduled_for ?? '') ||
			dueAt !== (item.due_at ?? '')
	);
	const summaryText = $derived(excerpt(description));

	$effect(() => {
		if (syncedAt !== item.updated_at) {
			title = item.title;
			description = item.description_md;
			status = item.status;
			priority = item.priority;
			scheduledFor = item.scheduled_for ?? '';
			dueAt = item.due_at ?? '';
			syncedAt = item.updated_at;
		}

		if (isHighlighted) {
			detailsOpen = true;
		}
	});

	function excerpt(value: string): string {
		const normalized = value.replace(/\s+/g, ' ').trim();
		if (!normalized) return '';
		return normalized.length > 180 ? `${normalized.slice(0, 177)}...` : normalized;
	}

	function toneForStatus(value: TaskStatus): string {
		if (value === 'in_progress') return 'border-info/25 bg-info/10 text-info';
		if (value === 'blocked') return 'border-error/25 bg-error/10 text-error';
		if (value === 'done') return 'border-success/25 bg-success/10 text-success';
		if (value === 'cancelled') return 'border-white/10 bg-[#1a1d24] text-base-content/45';
		return 'border-white/10 bg-white/[0.04] text-base-content/72';
	}

	function toneForPriority(value: TaskPriority): string {
		if (value === 'urgent') return 'border-error/20 bg-error/10 text-error';
		if (value === 'high') return 'border-warning/30 bg-warning/10 text-warning';
		if (value === 'low') return 'border-white/10 bg-[#1d2128] text-base-content/52';
		return 'border-white/10 bg-white/[0.04] text-base-content/68';
	}

	function resetDraft(): void {
		title = item.title;
		description = item.description_md;
		status = item.status;
		priority = item.priority;
		scheduledFor = item.scheduled_for ?? '';
		dueAt = item.due_at ?? '';
		saveState = 'idle';
	}

	async function save(): Promise<void> {
		if (!dirty || saveState === 'saving') return;
		saveState = 'saving';
		const response = await fetch(`/api/tasks/${item.id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				title,
				description_md: description,
				status,
				priority,
				scheduled_for: scheduledFor || null,
				due_at: dueAt || null
			})
		});

		if (!response.ok) {
			saveState = 'error';
			return;
		}

		saveState = 'idle';
		await invalidateAll();
	}
</script>

<article
	id={`task-${item.id}`}
	class={cn(
		'bp-task-card scroll-mt-28 transition',
		isHighlighted && 'border-primary/60 bg-white/10 shadow-[0_18px_45px_rgba(125,211,252,0.12)]'
	)}
	style={`margin-left:${depth * 18}px`}
>
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div class="min-w-0 flex-1">
			<div class="flex flex-wrap items-center gap-2">
				<span class={cn('bp-task-chip', toneForStatus(status))}>{statusLabels[status]}</span>
				<span class={cn('bp-task-chip', toneForPriority(priority))}>{priority} priority</span>
				{#if scheduledFor}
					<span class="bp-task-chip border-white/10 bg-white/[0.04] text-base-content/68">Scheduled {formatDate(scheduledFor)}</span>
				{/if}
				{#if dueAt}
					<span class="bp-task-chip border-warning/25 bg-warning/10 text-warning">Due {formatDate(dueAt)}</span>
				{/if}
				<span class="bp-meta">Updated {formatRelative(item.updated_at)}</span>
				{#if item.children.length}
					<span class="bp-task-chip border-white/10 bg-white/[0.04] text-base-content/68">
						{item.children.length} subtask{item.children.length === 1 ? '' : 's'}
					</span>
				{/if}
			</div>
			<input class="bp-task-title-input mt-3" bind:value={title} />
			{#if !detailsOpen && summaryText}
				<p class="bp-task-snippet mt-2">{summaryText}</p>
			{/if}
		</div>

		<div class="flex flex-wrap items-center gap-2 lg:justify-end">
			<select class="select select-bordered select-sm min-w-[10.5rem]" bind:value={status}>
				{#each statusOptions as option}
					<option value={option}>{option.replaceAll('_', ' ')}</option>
				{/each}
			</select>
			<button
				class="btn btn-sm btn-ghost"
				onclick={() => {
					detailsOpen = !detailsOpen;
					if (!detailsOpen) subtaskComposerOpen = false;
				}}
			>
				{detailsOpen ? 'Less' : 'Details'}
			</button>
			<button
				class="btn btn-sm btn-ghost"
				onclick={() => {
					detailsOpen = true;
					subtaskComposerOpen = !subtaskComposerOpen;
				}}
			>
				{subtaskComposerOpen ? 'Close subtask' : 'Add subtask'}
			</button>
			{#if dirty}
				<button class="btn btn-sm btn-primary" onclick={save} disabled={saveState === 'saving'}>
					{saveState === 'saving' ? 'Saving…' : 'Save'}
				</button>
				<button class="btn btn-sm btn-ghost" onclick={resetDraft}>Reset</button>
			{/if}
		</div>
	</div>

	{#if detailsOpen}
		<div class="bp-task-details">
			<div class="grid gap-3 lg:grid-cols-[11rem_11rem_11rem_auto]">
				<label class="grid gap-2">
					<span class="bp-meta">Priority</span>
					<select class="select select-bordered w-full" bind:value={priority}>
						{#each priorityOptions as option}
							<option value={option}>{option}</option>
						{/each}
					</select>
				</label>
				<label class="grid gap-2">
					<span class="bp-meta">Scheduled</span>
					<input class="input input-bordered w-full" type="date" bind:value={scheduledFor} />
				</label>
				<label class="grid gap-2">
					<span class="bp-meta">Due</span>
					<input class="input input-bordered w-full" type="date" bind:value={dueAt} />
				</label>
				<div class="flex items-end justify-end">
					<p class="text-sm text-base-content/55">
						{item.parent_task_id ? 'Nested under a parent task.' : 'Top-level project task.'}
					</p>
				</div>
			</div>

			<label class="grid gap-2">
				<span class="bp-meta">Working notes</span>
				<textarea
					class="textarea textarea-bordered min-h-28 w-full"
					bind:value={description}
					placeholder="Capture acceptance criteria, blockers, context, or links."
				></textarea>
			</label>

			{#if subtaskComposerOpen}
				<TaskComposer
					projectId={project.id}
					parentTaskId={item.id}
					submitLabel="Create subtask"
					onCreated={() => {
						subtaskComposerOpen = false;
						detailsOpen = true;
					}}
				/>
			{/if}
		</div>
	{/if}

	{#if item.children.length}
		<div class="bp-task-children">
			{#each item.children as child (child.id)}
				<TaskNode item={child} {project} depth={depth + 1} {highlightedTaskId} />
			{/each}
		</div>
	{/if}

	{#if saveState === 'error'}
		<p class="text-sm text-error">Task changes did not save. Try again.</p>
	{/if}
</article>
