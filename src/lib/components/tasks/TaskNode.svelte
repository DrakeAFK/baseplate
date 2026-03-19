<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { Project, TaskPriority, TaskStatus, TaskTreeItem } from '$lib/types/models';
	import { cn } from '$lib/utils/cn';
	import { formatRelative } from '$lib/utils/dates';
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

	let title = $state(untrack(() => item.title));
	let description = $state(untrack(() => item.description_md));
	let status = $state<TaskStatus>(untrack(() => item.status));
	let priority = $state<TaskPriority>(untrack(() => item.priority));
	let scheduledFor = $state(untrack(() => item.scheduled_for ?? ''));
	let dueAt = $state(untrack(() => item.due_at ?? ''));
	let syncedAt = $state(untrack(() => item.updated_at));
	let detailsOpen = $state(untrack(() => Boolean(item.description_md || item.children.length || item.scheduled_for || item.due_at)));
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

	$effect(() => {
		if (syncedAt !== item.updated_at) {
			title = item.title;
			description = item.description_md;
			status = item.status;
			priority = item.priority;
			scheduledFor = item.scheduled_for ?? '';
			dueAt = item.due_at ?? '';
			syncedAt = item.updated_at;
			detailsOpen = detailsOpen || Boolean(item.description_md || item.children.length || item.scheduled_for || item.due_at);
		}

		if (isHighlighted) {
			detailsOpen = true;
		}
	});

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
		'bp-panel-soft grid gap-4 p-4 scroll-mt-28 transition',
		isHighlighted && 'border-primary/60 bg-white/10 shadow-[0_18px_45px_rgba(125,211,252,0.12)]'
	)}
	style={`margin-left:${depth * 14}px`}
>
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div class="min-w-0 flex-1">
			<div class="flex flex-wrap items-center gap-2">
				<span class="badge badge-outline border-white/10 uppercase">{status.replaceAll('_', ' ')}</span>
				<span class="bp-meta">Updated {formatRelative(item.updated_at)}</span>
				{#if item.children.length}
					<span class="bp-meta">{item.children.length} subtasks</span>
				{/if}
			</div>
			<input class="input input-bordered mt-3 h-[3.25rem] w-full text-base font-medium" bind:value={title} />
		</div>

		<div class="flex flex-wrap items-center gap-2">
			<button class="btn btn-sm btn-ghost" onclick={() => (detailsOpen = !detailsOpen)}>
				{detailsOpen ? 'Less' : 'Details'}
			</button>
			<button class="btn btn-sm btn-ghost" onclick={() => (subtaskComposerOpen = !subtaskComposerOpen)}>
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

	<div class="grid gap-3 md:grid-cols-4">
		<label class="grid gap-2">
			<span class="bp-meta">Status</span>
			<select class="select select-bordered w-full" bind:value={status}>
				{#each statusOptions as option}
					<option value={option}>{option.replaceAll('_', ' ')}</option>
				{/each}
			</select>
		</label>
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
	</div>

	{#if detailsOpen}
		<label class="grid gap-2">
			<span class="bp-meta">Working notes</span>
			<textarea
				class="textarea textarea-bordered min-h-28 w-full"
				bind:value={description}
				placeholder="Capture acceptance criteria, blockers, context, or links."
			></textarea>
		</label>
	{/if}

	{#if saveState === 'error'}
		<p class="text-sm text-error">Task changes did not save. Try again.</p>
	{/if}

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

	{#if item.children.length}
		<div class="grid gap-3 border-l border-white/10 pl-3">
			{#each item.children as child (child.id)}
				<TaskNode item={child} {project} depth={depth + 1} {highlightedTaskId} />
			{/each}
		</div>
	{/if}
</article>
