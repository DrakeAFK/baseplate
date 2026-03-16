<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import MarkdownEditor from '$lib/components/editor/MarkdownEditor.svelte';
	import { formatDate, formatRelative } from '$lib/utils/dates';

	let { data }: { data: PageData } = $props();

	async function toggleFocus(projectId: string, pinned: boolean) {
		await fetch(pinned ? `/api/today/focus/${projectId}` : '/api/today/focus', {
			method: pinned ? 'DELETE' : 'POST',
			headers: pinned ? undefined : { 'content-type': 'application/json' },
			body: pinned ? undefined : JSON.stringify({ projectId })
		});
		await invalidateAll();
	}
</script>

<div class="grid gap-6">
	<section class="rounded-[2rem] border border-white/10 bg-base-200/50 p-6">
		<p class="text-xs uppercase tracking-[0.3em] text-base-content/45">Today</p>
		<h1 class="mt-2 text-4xl font-semibold text-white">Work with intent, not tab sprawl.</h1>
		<p class="mt-3 max-w-3xl text-base-content/65">
			Pinned focus, active tasks, recent meetings, and your daily note all live here. The daily note for {data.daily.note.title} is created automatically and saved to disk.
		</p>
	</section>

	<section class="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
		<div class="grid gap-6">
			<div class="rounded-[1.8rem] border border-white/10 bg-base-200/45 p-5">
				<div class="mb-4 flex items-center justify-between">
					<h2 class="text-xl font-semibold text-white">Pinned focus</h2>
				</div>
				<div class="grid gap-3">
					{#if data.pinnedProjects.length}
						{#each data.pinnedProjects as project}
							<div class="flex items-center justify-between rounded-[1.2rem] border border-white/10 bg-base-300/25 px-4 py-3">
								<a class="font-medium" href={`/projects/${project.slug}`}>{project.title}</a>
								<button class="btn btn-xs" onclick={() => toggleFocus(project.id, true)}>Unpin</button>
							</div>
						{/each}
					{:else}
						<p class="text-sm text-base-content/55">Pin a project to keep today grounded. Quick Work is a good default when you just need to move.</p>
					{/if}
					<div class="flex flex-wrap gap-2">
						{#each data.allProjects as project}
							<button class="btn btn-sm btn-ghost" onclick={() => toggleFocus(project.id, false)}>{project.title}</button>
						{/each}
					</div>
				</div>
			</div>

			<div class="rounded-[1.8rem] border border-white/10 bg-base-200/45 p-5">
				<h2 class="text-xl font-semibold text-white">Active work</h2>
				<div class="mt-4 grid gap-3">
					{#each data.activeTasks as task}
						<div class="rounded-[1.2rem] border border-white/10 bg-base-300/25 px-4 py-3">
							<div class="flex items-center justify-between gap-3">
								<div>
									<p class="font-medium text-white">{task.title}</p>
									<p class="text-sm text-base-content/60">{task.project.title} · {task.status.replaceAll('_', ' ')}</p>
								</div>
								<a class="btn btn-xs" href={`/projects/${task.project.slug}`}>Open</a>
							</div>
						</div>
					{/each}
				</div>
			</div>
		</div>

		<div class="grid gap-6">
			<div class="rounded-[1.8rem] border border-white/10 bg-base-200/45 p-5">
				<h2 class="text-xl font-semibold text-white">Recent meetings</h2>
				<div class="mt-4 grid gap-3">
					{#each data.recentMeetings as meeting}
						<a class="rounded-[1.2rem] border border-white/10 bg-base-300/25 px-4 py-3 transition hover:border-info/30" href={`/projects/${meeting.project.slug}/meetings/${meeting.id}`}>
							<p class="font-medium">{meeting.title}</p>
							<p class="text-sm text-base-content/60">{meeting.project.title} · {formatDate(meeting.meeting_date)}</p>
							<p class="mt-1 text-sm text-base-content/55">{meeting.excerpt}</p>
						</a>
					{/each}
				</div>
			</div>

			<div class="rounded-[1.8rem] border border-white/10 bg-base-200/45 p-5">
				<h2 class="text-xl font-semibold text-white">Recent notes</h2>
				<div class="mt-4 grid gap-3">
					{#each data.recentNotes as note}
						<a class="rounded-[1.2rem] border border-white/10 bg-base-300/25 px-4 py-3 transition hover:border-info/30" href={note.project ? `/projects/${note.project.slug}/notes/${note.id}` : '/inbox'}>
							<p class="font-medium">{note.title}</p>
							<p class="text-sm text-base-content/60">{note.project?.title ?? 'Global'} · {formatRelative(note.updated_at)}</p>
							<p class="mt-1 text-sm text-base-content/55">{note.excerpt}</p>
						</a>
					{/each}
				</div>
			</div>
		</div>
	</section>

	<MarkdownEditor value={data.daily.body} saveUrl={`/api/notes/${data.daily.note.id}/content`} previewHtml={data.daily.html} label="Daily note" onSaved={() => invalidateAll()} />
</div>
