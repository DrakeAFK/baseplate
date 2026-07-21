<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
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

	async function archiveMeeting(): Promise<void> {
		if (!confirm(`Archive “${document.meeting.title}”?`)) return;
		const response = await fetch(`/api/meetings/${document.meeting.id}/archive`, { method: 'POST' });
		if (!response.ok) { error = 'Unable to archive meeting'; return; }
		await goto(`/projects/${document.project.slug}`);
	}
</script>

<div class="bp-page">
	<section class="bp-hero pb-4">
		<div class="bp-toolbar">
			<div class="grid max-w-3xl gap-3">
				<p class="bp-kicker">Meeting</p>
				<input class="input input-bordered h-12 w-full text-[1.45rem] font-semibold text-white" bind:value={title} />
				<div class="grid gap-3 md:grid-cols-[14rem_auto]">
					<input class="input input-bordered" type="date" bind:value={meetingDate} />
					<p class="self-center text-sm text-base-content/65">{document.project.title} / Updated {formatRelative(document.meeting.updated_at)}</p>
				</div>
			</div>
			<div class="flex flex-wrap gap-2">
				<button class="btn btn-sm btn-primary" onclick={saveMeta} disabled={saving || !title.trim()}>
					{saving ? 'Saving...' : 'Save details'}
				</button>
				<button class="btn btn-sm btn-ghost" onclick={extractTasks}>Extract tasks</button>
				<a class="btn btn-sm btn-ghost" href={`/projects/${document.project.slug}`}>Back to dashboard</a>
				<button class="btn btn-sm btn-ghost text-error" onclick={archiveMeeting}>Archive</button>
			</div>
		</div>
		{#if error}
			<p class="mt-4 text-sm text-error">{error}</p>
		{/if}
	</section>
	{#if document.missing}<div class="bp-carryover-bar border-error/40"><p class="text-sm text-error">The canonical meeting file is missing. The database record has been preserved for recovery.</p></div>{/if}

	<MarkdownEditor
		value={document.body}
		saveUrl={`/api/meetings/${document.meeting.id}/content`}
		previewHtml={document.html}
		label={`Meeting note / ${formatDate(document.meeting.meeting_date)}`}
		onSaved={(payload) => {
			if (payload && typeof payload === 'object' && 'document' in payload) {
				document = payload.document as PageData;
				title = document.meeting.title;
				meetingDate = document.meeting.meeting_date;
			}
		}}
	/>

	<div class="grid gap-4 xl:grid-cols-2">
		<section class="bp-panel p-4">
			<h2 class="bp-section-title">Extracted tasks</h2>
			<div class="bp-list mt-4">
				{#if document.relatedTasks.length}
					{#each document.relatedTasks as task}
						<a class="bp-list-card" href={`/projects/${document.project.slug}#task-${task.id}`}>
							<p class="font-medium text-white">{task.title}</p>
							<p class="mt-1 text-sm text-base-content/55">{task.status.replaceAll('_', ' ')} / {task.priority}</p>
						</a>
					{/each}
				{:else}
					<p class="bp-empty">No extracted tasks.</p>
				{/if}
			</div>
		</section>

		<section class="bp-panel p-4">
			<h2 class="bp-section-title">Backlinks</h2>
			<div class="bp-list mt-4">
				{#if document.backlinks.length}
					{#each document.backlinks as backlink}
						<a class="bp-list-card" href={backlink.href ?? `/projects/${document.project.slug}`}>
							<p class="font-medium text-white">{backlink.title}</p>
							<p class="mt-1 text-sm text-base-content/55">{backlink.projectTitle ?? backlink.fromType}</p>
							{#if backlink.snippet}
								<p class="mt-2 text-sm text-base-content/45">{backlink.snippet}</p>
							{/if}
						</a>
					{/each}
				{:else}
					<p class="bp-empty">No backlinks.</p>
				{/if}
			</div>
		</section>
	</div>
</div>
