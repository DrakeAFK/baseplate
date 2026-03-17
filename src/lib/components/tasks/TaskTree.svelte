<script lang="ts">
	import type { Project, TaskTreeItem } from '$lib/types/models';
	import TaskNode from './TaskNode.svelte';

	let {
		items,
		project,
		depth = 0,
		highlightedTaskId = null
	}: {
		items: TaskTreeItem[];
		project: Project;
		depth?: number;
		highlightedTaskId?: string | null;
	} = $props();
</script>

<div class="grid gap-4">
	{#each items as item (item.id)}
		<TaskNode {item} {project} {depth} {highlightedTaskId} />
	{/each}
</div>
