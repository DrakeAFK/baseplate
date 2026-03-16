<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import type { TaskStatus } from '$lib/types/models';
	import TaskTree from '$lib/components/tasks/TaskTree.svelte';
	import { formatDate, formatRelative } from '$lib/utils/dates';

	let { data }: { data: PageData } = $props();
	const taskStatuses: TaskStatus[] = ['in_progress', 'blocked', 'todo', 'done', 'cancelled'];
	const noteKinds: Array<'note' | 'doc' | 'decision'> = ['note', 'doc', 'decision'];

	async function quickTask() {
		const title = prompt('Task title');
		if (!title) return;
		await fetch('/api/tasks', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ projectId: data.project.id, title })
		});
		await invalidateAll();
	}

	async function toggleArchive(archived: boolean) {
		await fetch(`/api/projects/${data.project.id}/${archived ? 'restore' : 'archive'}`, { method: 'POST' });
		await invalidateAll();
	}
</script>

<div class="grid gap-6">
	<section class="rounded-[2rem] border border-white/10 bg-base-200/50 p-6">
		<div class="flex flex-wrap items-start justify-between gap-4">
			<div>
				<p class="text-xs uppercase tracking-[0.3em] text-base-content/45">Project dashboard</p>
				<h1 class="mt-2 text-4xl font-semibold text-white">{data.project.title}</h1>
				<p class="mt-3 max-w-3xl text-base-content/65">{data.project.summary || 'This project is ready for notes, meetings, and tasks.'}</p>
			</div>
			<div class="flex flex-wrap gap-2">
				<button class="btn btn-primary btn-sm" onclick={quickTask}>New task</button>
				<button class="btn btn-sm" onclick={() => toggleArchive(Boolean(data.project.archived_at))}>
					{data.project.archived_at ? 'Restore' : 'Archive'}
				</button>
			</div>
		</div>
		<div class="mt-6 flex flex-wrap gap-2 text-sm text-base-content/60">
			<span class="badge badge-outline">{data.project.kind}</span>
			<span class="badge badge-ghost">{data.project.status}</span>
			<span>Updated {formatRelative(data.project.updated_at)}</span>
		</div>
	</section>

	<div class="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
		<div class="grid gap-6">
			<div class="rounded-[1.8rem] border border-white/10 bg-base-200/45 p-5">
				<div class="mb-4 flex items-center justify-between">
					<h2 class="text-xl font-semibold text-white">Open tasks</h2>
					<button class="btn btn-xs" onclick={quickTask}>Add task</button>
				</div>
				<div class="grid gap-5">
					{#each taskStatuses as status}
						<div class="grid gap-3">
							<div class="flex items-center justify-between">
								<h3 class="text-sm font-medium uppercase tracking-[0.25em] text-base-content/55">{status.replaceAll('_', ' ')}</h3>
								<span class="text-xs text-base-content/45">{data.taskGroups[status].length}</span>
							</div>
							{#if data.taskGroups[status].length}
								<TaskTree items={data.taskGroups[status]} project={data.project} />
							{:else}
								<p class="text-sm text-base-content/45">Nothing here yet.</p>
							{/if}
						</div>
					{/each}
				</div>
			</div>

			<div class="rounded-[1.8rem] border border-white/10 bg-base-200/45 p-5">
				<h2 class="text-xl font-semibold text-white">Project home</h2>
				{#if data.homeNote}
					<a class="mt-4 block rounded-[1.2rem] border border-white/10 bg-base-300/25 px-4 py-4 transition hover:border-info/30" href={`/projects/${data.project.slug}/notes/${data.homeNote.note.id}`}>
						<p class="font-medium">{data.homeNote.note.title}</p>
						<p class="mt-1 text-sm text-base-content/60">{data.homeNote.note.excerpt}</p>
					</a>
				{/if}
			</div>
		</div>

		<div class="grid gap-6">
			<div class="rounded-[1.8rem] border border-white/10 bg-base-200/45 p-5">
				<h2 class="text-xl font-semibold text-white">Recent meetings</h2>
				<div class="mt-4 grid gap-3">
					{#each data.meetings as meeting}
						<a class="rounded-[1.2rem] border border-white/10 bg-base-300/25 px-4 py-3 transition hover:border-info/30" href={`/projects/${data.project.slug}/meetings/${meeting.id}`}>
							<p class="font-medium">{meeting.title}</p>
							<p class="text-sm text-base-content/60">{formatDate(meeting.meeting_date)} · {meeting.task_count} linked tasks</p>
							<p class="mt-1 text-sm text-base-content/55">{meeting.excerpt}</p>
						</a>
					{/each}
				</div>
			</div>

			<div class="rounded-[1.8rem] border border-white/10 bg-base-200/45 p-5">
				<h2 class="text-xl font-semibold text-white">Notes, docs, decisions</h2>
				<div class="mt-4 grid gap-4">
					{#each noteKinds as kind}
						<div class="grid gap-2">
							<p class="text-xs uppercase tracking-[0.25em] text-base-content/45">{kind}s</p>
							{#each data.notesByKind[kind] as note}
								<a class="rounded-[1.1rem] border border-white/10 bg-base-300/25 px-4 py-3 transition hover:border-info/30" href={`/projects/${data.project.slug}/notes/${note.id}`}>
									<p class="font-medium">{note.title}</p>
									<p class="text-sm text-base-content/55">{note.excerpt}</p>
								</a>
							{/each}
						</div>
					{/each}
				</div>
			</div>

			<div class="rounded-[1.8rem] border border-white/10 bg-base-200/45 p-5">
				<h2 class="text-xl font-semibold text-white">Backlinks & activity</h2>
				<div class="mt-4 grid gap-3">
					{#each data.backlinks as backlink}
						<a class="rounded-[1.1rem] border border-white/10 bg-base-300/25 px-4 py-3" href={backlink.href ?? '#'}>
							<p class="font-medium">{backlink.title}</p>
							<p class="text-sm text-base-content/55">{backlink.projectTitle ?? backlink.fromType}</p>
						</a>
					{/each}
					{#each data.activity as item}
						<a class="rounded-[1.1rem] border border-white/10 bg-base-300/15 px-4 py-3" href={item.href ?? '#'}>
							<p class="font-medium">{item.title}</p>
							<p class="text-sm text-base-content/55">{item.type} · {formatRelative(item.updatedAt)}</p>
						</a>
					{/each}
				</div>
			</div>
		</div>
	</div>
</div>
