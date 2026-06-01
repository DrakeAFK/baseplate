<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { TaskPriority, TaskStatus } from '$lib/types/models';

	let {
		projectId,
		parentTaskId = null,
		compact = false,
		submitLabel = 'Create task',
		onCreated = () => {}
	}: {
		projectId: string;
		parentTaskId?: string | null;
		compact?: boolean;
		submitLabel?: string;
		onCreated?: () => void;
	} = $props();

	const statusOptions: TaskStatus[] = ['todo', 'in_progress', 'blocked', 'done', 'cancelled'];
	const priorityOptions: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];

	let open = $state(false);
	let detailsOpen = $state(false);
	let title = $state('');
	let description = $state('');
	let status = $state<TaskStatus>('todo');
	let priority = $state<TaskPriority>('medium');
	let scheduledFor = $state('');
	let dueAt = $state('');
	let saving = $state(false);
	let error = $state('');

	$effect(() => {
		if (!compact) {
			open = true;
		}
	});

	function resetDraft(): void {
		title = '';
		description = '';
		status = 'todo';
		priority = 'medium';
		scheduledFor = '';
		dueAt = '';
		error = '';
		detailsOpen = false;
	}

	async function submit(): Promise<void> {
		if (!title.trim() || saving) return;
		saving = true;
		error = '';
		const response = await fetch('/api/tasks', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				projectId,
				parentTaskId,
				title,
				description: description || undefined,
				status,
				priority,
				scheduledFor: scheduledFor || null,
				dueAt: dueAt || null
			})
		});
		const payload = await response.json().catch(() => null);
		saving = false;

		if (!response.ok) {
			error = payload?.error ?? 'Unable to create task';
			return;
		}

		resetDraft();
		if (compact) open = false;
		await invalidateAll();
		onCreated();
	}
</script>

{#if compact && !open}
	<button class="btn btn-sm btn-ghost" onclick={() => (open = true)}>
		{submitLabel}
	</button>
{:else}
	<div class="bp-panel-soft grid gap-3 p-3">
		<div class="bp-toolbar">
			<div class="flex items-center gap-3">
				<p class="bp-kicker">{parentTaskId ? 'Subtask' : 'New task'}</p>
				<span class="bp-meta">{status.replaceAll('_', ' ')} / {priority}</span>
			</div>
			<button class="btn btn-ghost btn-sm" onclick={() => (detailsOpen = !detailsOpen)}>
				{detailsOpen ? 'Less' : 'More'}
			</button>
		</div>

		<div class="grid gap-3 xl:grid-cols-[minmax(0,1.25fr)_10rem_10rem_auto] xl:items-end">
			<label class="grid gap-2">
				<span class="bp-meta">Title</span>
				<input class="input input-bordered w-full" bind:value={title} placeholder={parentTaskId ? 'Subtask title' : 'Task title'} />
			</label>
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
			<div class="flex items-end justify-end">
				<button class="btn btn-primary w-full xl:w-auto" onclick={submit} disabled={saving || !title.trim()}>
					{saving ? 'Saving...' : submitLabel}
				</button>
			</div>
		</div>

		{#if detailsOpen}
			<div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_10rem_10rem]">
				<label class="grid gap-2">
					<span class="bp-meta">Notes</span>
					<textarea
						class="textarea textarea-bordered min-h-24 w-full"
						bind:value={description}
						placeholder="Context, blockers, acceptance notes"
					></textarea>
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
		{/if}

		{#if error}
			<p class="text-sm text-error">{error}</p>
		{/if}

		{#if compact}
			<div class="flex justify-end">
				<button
					class="btn btn-ghost"
					onclick={() => {
						resetDraft();
						open = false;
					}}
				>
					Cancel
				</button>
			</div>
		{/if}
	</div>
{/if}
