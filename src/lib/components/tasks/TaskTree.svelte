<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { Project, TaskStatus, TaskTreeItem } from '$lib/types/models';
	import { formatRelative } from '$lib/utils/dates';
	import TaskTree from './TaskTree.svelte';

	let {
		items,
		project,
		depth = 0
	}: {
		items: TaskTreeItem[];
		project: Project;
		depth?: number;
	} = $props();

	async function updateTask(id: string, patch: Record<string, string | null>) {
		await fetch(`/api/tasks/${id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(patch)
		});
		await invalidateAll();
	}

	async function addSubtask(parentTaskId: string) {
		const title = prompt('Subtask title');
		if (!title) return;
		await fetch('/api/tasks', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ projectId: project.id, title, parentTaskId })
		});
		await invalidateAll();
	}

	const statusOptions: TaskStatus[] = ['todo', 'in_progress', 'blocked', 'done', 'cancelled'];
</script>

<div class="grid gap-3">
	{#each items as item (item.id)}
		<div class="rounded-[1.25rem] border border-white/10 bg-base-300/30 p-4" style={`margin-left:${depth * 18}px`}>
			<div class="flex flex-wrap items-start justify-between gap-3">
				<div class="grid gap-2">
					<p class="font-medium text-base-content">{item.title}</p>
					<div class="flex flex-wrap items-center gap-2 text-xs text-base-content/55">
						<span class="badge badge-ghost">{item.priority}</span>
						<span>Updated {formatRelative(item.updated_at)}</span>
					</div>
					{#if item.description_md}
						<p class="max-w-3xl text-sm text-base-content/70">{item.description_md}</p>
					{/if}
				</div>

				<div class="flex flex-wrap items-center gap-2">
					<select class="select select-xs select-bordered" value={item.status} onchange={(event) => updateTask(item.id, { status: (event.currentTarget as HTMLSelectElement).value })}>
						{#each statusOptions as status}
							<option value={status}>{status.replaceAll('_', ' ')}</option>
						{/each}
					</select>
					<button class="btn btn-xs" onclick={() => addSubtask(item.id)}>Subtask</button>
				</div>
			</div>
		</div>

		{#if item.children.length}
			<TaskTree items={item.children} {project} depth={depth + 1} />
		{/if}
	{/each}
</div>
