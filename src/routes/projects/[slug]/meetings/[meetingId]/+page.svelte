<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import MarkdownEditor from '$lib/components/editor/MarkdownEditor.svelte';
	import { formatDate, formatRelative } from '$lib/utils/dates';
	import { untrack } from 'svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let document = $state(untrack(() => data));
	let title = $state(untrack(() => data.meeting.title));
	let meetingDate = $state(untrack(() => data.meeting.meeting_date));
	let saving = $state(false);
	let error = $state('');

	$effect(() => {
		document = data;
		title = data.meeting.title;
		meetingDate = data.meeting.meeting_date;
	});

	async function extractTasks(): Promise<void> {
		await fetch('/api/tasks/extract-from-markdown', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ meetingId: document.meeting.id })
		});
		await invalidateAll();
	}

	async function saveMeta(): Promise<void> {
		if (!title.trim() || saving) return;
		saving = true;
		error = '';
		const response = await fetch(`/api/meetings/${document.meeting.id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ title, meeting_date: meetingDate })
		});
		const payload = await response.json().catch(() => null);
		saving = false;
		if (!response.ok) {
			error = payload?.error ?? 'Unable to update meeting';
			return;
		}

		if (payload?.meeting) {
			document = {
				...document,
				meeting: payload.meeting,
				note: {
					...document.note,
					title: payload.meeting.title,
					updated_at: payload.meeting.updated_at
				}
			};
			title = payload.meeting.title;
			meetingDate = payload.meeting.meeting_date;
		}
	}
</script>

<div class="grid gap-6">
	<section class="rounded-4xl border border-white/10 bg-base-200/50 p-6">
		<div class="flex flex-wrap items-start justify-between gap-4">
			<div class="grid max-w-3xl gap-3">
				<p class="text-xs uppercase tracking-[0.3em] text-base-content/45">Meeting</p>
				<input class="input input-bordered w-full text-3xl font-semibold text-white" bind:value={title} />
				<div class="grid gap-3 md:grid-cols-[14rem_auto]">
					<input class="input input-bordered" type="date" bind:value={meetingDate} />
					<p class="self-center text-base-content/65">{document.project.title} · Updated {formatRelative(document.meeting.updated_at)}</p>
				</div>
			</div>
			<div class="flex flex-wrap gap-2">
				<button class="btn btn-sm btn-primary" onclick={saveMeta} disabled={saving || !title.trim()}>
					{saving ? 'Saving…' : 'Save details'}
				</button>
				<button class="btn btn-sm" onclick={extractTasks}>Extract tasks</button>
				<a class="btn btn-sm" href={`/projects/${document.project.slug}`}>Back to dashboard</a>
			</div>
		</div>
		{#if error}
			<p class="mt-3 text-sm text-error">{error}</p>
		{/if}
	</section>

	<MarkdownEditor
		value={document.body}
		saveUrl={`/api/meetings/${document.meeting.id}/content`}
		previewHtml={document.html}
		label={`Meeting note · ${formatDate(document.meeting.meeting_date)}`}
		onSaved={(payload) => {
			if (payload && typeof payload === 'object' && 'document' in payload) {
				document = payload.document as PageData;
				title = document.meeting.title;
				meetingDate = document.meeting.meeting_date;
			}
		}}
	/>

	<div class="grid gap-6 xl:grid-cols-2">
		<div class="rounded-[1.8rem] border border-white/10 bg-base-200/45 p-5">
			<h2 class="text-xl font-semibold text-white">Tasks extracted from this meeting</h2>
			<div class="mt-4 grid gap-3">
				{#if document.relatedTasks.length}
					{#each document.relatedTasks as task}
						<a class="rounded-[1.2rem] border border-white/10 bg-base-300/25 px-4 py-3 transition hover:border-info/30" href={`/projects/${document.project.slug}#task-${task.id}`}>
							<p class="font-medium text-white">{task.title}</p>
							<p class="text-sm text-base-content/55">{task.status.replaceAll('_', ' ')} · {task.priority}</p>
						</a>
					{/each}
				{:else}
					<p class="rounded-[1.2rem] border border-dashed border-white/10 bg-base-300/15 px-4 py-5 text-sm text-base-content/45">
						Checkbox items extracted from the meeting note will appear here.
					</p>
				{/if}
			</div>
		</div>

		<div class="rounded-[1.8rem] border border-white/10 bg-base-200/45 p-5">
			<h2 class="text-xl font-semibold text-white">Backlinks</h2>
			<div class="mt-4 grid gap-3">
				{#if document.backlinks.length}
					{#each document.backlinks as backlink}
						<a class="rounded-[1.2rem] border border-white/10 bg-base-300/25 px-4 py-3 transition hover:border-info/30" href={backlink.href ?? `/projects/${document.project.slug}`}>
							<p class="font-medium text-white">{backlink.title}</p>
							<p class="text-sm text-base-content/55">{backlink.projectTitle ?? backlink.fromType}</p>
							<p class="text-sm text-base-content/45">{backlink.snippet || 'No summary yet.'}</p>
						</a>
					{/each}
				{:else}
					<p class="rounded-[1.2rem] border border-dashed border-white/10 bg-base-300/15 px-4 py-5 text-sm text-base-content/45">
						References back into this meeting will appear here.
					</p>
				{/if}
			</div>
		</div>
	</div>
</div>
