<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import MarkdownEditor from '$lib/components/editor/MarkdownEditor.svelte';
	import { formatDate, formatRelative } from '$lib/utils/dates';

	let { data }: { data: PageData } = $props();

	async function extractTasks() {
		await fetch('/api/tasks/extract-from-markdown', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ meetingId: data.meeting.id })
		});
		await invalidateAll();
	}
</script>

<div class="grid gap-6">
	<section class="rounded-[2rem] border border-white/10 bg-base-200/50 p-6">
		<div class="flex flex-wrap items-start justify-between gap-4">
			<div>
				<p class="text-xs uppercase tracking-[0.3em] text-base-content/45">Meeting</p>
				<h1 class="mt-2 text-4xl font-semibold text-white">{data.meeting.title}</h1>
				<p class="mt-2 text-base-content/65">{data.project.title} · {formatDate(data.meeting.meeting_date)} · Updated {formatRelative(data.meeting.updated_at)}</p>
			</div>
			<div class="flex gap-2">
				<button class="btn btn-sm" onclick={extractTasks}>Extract tasks</button>
				<a class="btn btn-sm" href={`/projects/${data.project.slug}`}>Back to project</a>
			</div>
		</div>
	</section>

	<MarkdownEditor value={data.body} saveUrl={`/api/meetings/${data.meeting.id}/content`} previewHtml={data.html} label="Meeting note" onSaved={() => invalidateAll()} />

	<div class="grid gap-6 xl:grid-cols-2">
		<div class="rounded-[1.8rem] border border-white/10 bg-base-200/45 p-5">
			<h2 class="text-xl font-semibold text-white">Tasks extracted from this meeting</h2>
			<div class="mt-4 grid gap-3">
				{#each data.relatedTasks as task}
					<div class="rounded-[1.2rem] border border-white/10 bg-base-300/25 px-4 py-3">
						<p class="font-medium">{task.title}</p>
						<p class="text-sm text-base-content/55">{task.status.replaceAll('_', ' ')} · {task.priority}</p>
					</div>
				{/each}
			</div>
		</div>

		<div class="rounded-[1.8rem] border border-white/10 bg-base-200/45 p-5">
			<h2 class="text-xl font-semibold text-white">Backlinks</h2>
			<div class="mt-4 grid gap-3">
				{#each data.backlinks as backlink}
					<a class="rounded-[1.2rem] border border-white/10 bg-base-300/25 px-4 py-3" href={backlink.href ?? '#'}>
						<p class="font-medium">{backlink.title}</p>
						<p class="text-sm text-base-content/55">{backlink.projectTitle ?? backlink.fromType}</p>
						<p class="text-sm text-base-content/45">{backlink.snippet}</p>
					</a>
				{/each}
			</div>
		</div>
	</div>
</div>
