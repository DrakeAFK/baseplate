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

<div class="bp-page">
	<section class="bp-hero p-6 md:p-7">
		<div class="bp-toolbar">
			<div class="grid max-w-3xl gap-3">
				<p class="bp-kicker">Meeting</p>
				<input class="input input-bordered h-14 w-full text-3xl font-semibold text-white" bind:value={title} />
				<div class="grid gap-3 md:grid-cols-[14rem_auto]">
					<input class="input input-bordered" type="date" bind:value={meetingDate} />
					<p class="self-center text-base-content/65">{document.project.title} · Updated {formatRelative(document.meeting.updated_at)}</p>
				</div>
			</div>
			<div class="flex flex-wrap gap-2">
				<button class="btn btn-sm btn-primary" onclick={saveMeta} disabled={saving || !title.trim()}>
					{saving ? 'Saving…' : 'Save details'}
				</button>
				<button class="btn btn-sm btn-ghost" onclick={extractTasks}>Extract tasks</button>
				<a class="btn btn-sm btn-ghost" href={`/projects/${document.project.slug}`}>Back to dashboard</a>
			</div>
		</div>
		{#if error}
			<p class="mt-4 text-sm text-error">{error}</p>
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
		<section class="bp-panel p-5">
			<div class="relative z-10">
				<h2 class="text-xl font-semibold text-white">Extracted tasks</h2>
				<div class="mt-4 bp-list">
					{#if document.relatedTasks.length}
						{#each document.relatedTasks as task}
							<a class="bp-list-card" href={`/projects/${document.project.slug}#task-${task.id}`}>
								<p class="font-medium text-white">{task.title}</p>
								<p class="mt-1 text-sm text-base-content/55">{task.status.replaceAll('_', ' ')} · {task.priority}</p>
							</a>
						{/each}
					{:else}
						<p class="bp-empty">Checkbox items extracted from this meeting appear here.</p>
					{/if}
				</div>
			</div>
		</section>

		<section class="bp-panel p-5">
			<div class="relative z-10">
				<h2 class="text-xl font-semibold text-white">Backlinks</h2>
				<div class="mt-4 bp-list">
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
						<p class="bp-empty">References to this meeting show up here.</p>
					{/if}
				</div>
			</div>
		</section>
	</div>
</div>
