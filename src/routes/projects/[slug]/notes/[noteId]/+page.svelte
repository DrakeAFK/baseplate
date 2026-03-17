<script lang="ts">
	import MarkdownEditor from '$lib/components/editor/MarkdownEditor.svelte';
	import { formatRelative } from '$lib/utils/dates';
	import { untrack } from 'svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let document = $state(untrack(() => data));
	let title = $state(untrack(() => data.note.title));
	let saving = $state(false);
	let error = $state('');

	$effect(() => {
		document = data;
		title = data.note.title;
	});

	const kindLabel = $derived(document.note.kind === 'project_home' ? 'Project overview' : document.note.kind.replace('_', ' '));
	const backLabel = $derived(document.note.kind === 'project_home' ? 'Back to dashboard' : 'Back to project');

	async function saveMeta(): Promise<void> {
		if (!title.trim() || saving) return;
		saving = true;
		error = '';
		const response = await fetch(`/api/notes/${document.note.id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ title })
		});
		const payload = await response.json().catch(() => null);
		saving = false;
		if (!response.ok) {
			error = payload?.error ?? 'Unable to update note';
			return;
		}

		if (payload?.note) {
			document = {
				...document,
				note: payload.note
			};
			title = payload.note.title;
		}
	}
</script>

<div class="grid gap-6">
	<section class="rounded-4xl border border-white/10 bg-base-200/50 p-6">
		<div class="flex flex-wrap items-start justify-between gap-4">
			<div class="max-w-3xl">
				<p class="text-xs uppercase tracking-[0.3em] text-base-content/45">{kindLabel}</p>
				<input class="input input-bordered mt-3 w-full text-3xl font-semibold text-white" bind:value={title} />
				<p class="mt-3 text-base-content/65">
					{document.project?.title} · Updated {formatRelative(document.note.updated_at)}
				</p>
			</div>
			<div class="flex gap-2">
				<button class="btn btn-primary btn-sm" onclick={saveMeta} disabled={saving || !title.trim()}>
					{saving ? 'Saving…' : 'Save title'}
				</button>
				{#if document.project}
					<a class="btn btn-sm" href={`/projects/${document.project.slug}`}>{backLabel}</a>
				{/if}
			</div>
		</div>
		{#if error}
			<p class="mt-3 text-sm text-error">{error}</p>
		{/if}
	</section>

	<MarkdownEditor
		value={document.body}
		saveUrl={`/api/notes/${document.note.id}/content`}
		previewHtml={document.html}
		label={document.note.kind === 'project_home' ? 'Project overview' : 'Note body'}
		onSaved={(payload) => {
			if (payload && typeof payload === 'object' && 'document' in payload) {
				document = payload.document as PageData;
				title = document.note.title;
			}
		}}
	/>

	<div class="rounded-[1.8rem] border border-white/10 bg-base-200/45 p-5">
		<h2 class="text-xl font-semibold text-white">Backlinks</h2>
		<div class="mt-4 grid gap-3">
			{#if document.backlinks.length}
				{#each document.backlinks as backlink}
					<a class="rounded-[1.2rem] border border-white/10 bg-base-300/25 px-4 py-3 transition hover:border-info/30" href={backlink.href ?? `/projects/${document.project?.slug ?? ''}`}>
						<p class="font-medium text-white">{backlink.title}</p>
						<p class="text-sm text-base-content/55">{backlink.projectTitle ?? backlink.fromType}</p>
						<p class="text-sm text-base-content/45">{backlink.snippet || 'No summary yet.'}</p>
					</a>
				{/each}
			{:else}
				<p class="rounded-[1.2rem] border border-dashed border-white/10 bg-base-300/15 px-4 py-5 text-sm text-base-content/45">
					Links back into this note will show up here once other notes or tasks reference it.
				</p>
			{/if}
		</div>
	</div>
</div>
