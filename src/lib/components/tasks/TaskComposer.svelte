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
	<div class="grid gap-4 rounded-3xl border border-white/10 bg-base-300/20 p-4">
		<div class="grid gap-3">
			<input class="input input-bordered w-full" bind:value={title} placeholder={parentTaskId ? 'Subtask title' : 'Task title'} />
			<textarea
				class="textarea textarea-bordered min-h-24 w-full"
				bind:value={description}
				placeholder="Context, next steps, acceptance notes"
			></textarea>
		</div>

		<div class="grid gap-3 md:grid-cols-4">
			<label class="grid gap-2">
				<span class="text-xs uppercase tracking-[0.24em] text-base-content/45">Status</span>
				<select class="select select-bordered w-full" bind:value={status}>
					{#each statusOptions as option}
						<option value={option}>{option.replaceAll('_', ' ')}</option>
					{/each}
				</select>
			</label>
			<label class="grid gap-2">
				<span class="text-xs uppercase tracking-[0.24em] text-base-content/45">Priority</span>
				<select class="select select-bordered w-full" bind:value={priority}>
					{#each priorityOptions as option}
						<option value={option}>{option}</option>
					{/each}
				</select>
			</label>
			<label class="grid gap-2">
				<span class="text-xs uppercase tracking-[0.24em] text-base-content/45">Scheduled</span>
				<input class="input input-bordered w-full" type="date" bind:value={scheduledFor} />
			</label>
			<label class="grid gap-2">
				<span class="text-xs uppercase tracking-[0.24em] text-base-content/45">Due</span>
				<input class="input input-bordered w-full" type="date" bind:value={dueAt} />
			</label>
		</div>

		{#if error}
			<p class="text-sm text-error">{error}</p>
		{/if}

		<div class="flex flex-wrap items-center justify-between gap-2">
			<p class="text-sm text-base-content/55">
				{parentTaskId ? 'Subtasks inherit the project and stay attached to their parent task.' : 'Tasks stay local-first in SQLite and the project workspace.'}
			</p>
			<div class="flex gap-2">
				{#if compact}
					<button
						class="btn btn-ghost"
						onclick={() => {
							resetDraft();
							open = false;
						}}
					>
						Cancel
					</button>
				{/if}
				<button class="btn btn-primary" onclick={submit} disabled={saving || !title.trim()}>
					{saving ? 'Saving…' : submitLabel}
				</button>
			</div>
		</div>
	</div>
{/if}
