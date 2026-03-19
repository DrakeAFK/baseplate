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

<div class="bp-page">
	<section class="bp-hero p-6 md:p-7">
		<div class="bp-toolbar">
			<div class="max-w-3xl">
				<p class="bp-kicker">{kindLabel}</p>
				<input class="input input-bordered mt-4 h-[3.25rem] w-full text-3xl font-semibold text-white" bind:value={title} />
				<p class="mt-4 text-base-content/65">{document.project?.title} · Updated {formatRelative(document.note.updated_at)}</p>
			</div>
			<div class="flex gap-2">
				<button class="btn btn-primary btn-sm" onclick={saveMeta} disabled={saving || !title.trim()}>
					{saving ? 'Saving…' : 'Save title'}
				</button>
				{#if document.project}
					<a class="btn btn-ghost btn-sm" href={`/projects/${document.project.slug}`}>{backLabel}</a>
				{/if}
			</div>
		</div>
		{#if error}
			<p class="mt-4 text-sm text-error">{error}</p>
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

	<section class="bp-panel p-5">
		<div class="relative z-10">
			<h2 class="text-xl font-semibold text-white">Backlinks</h2>
			<div class="mt-4 bp-list">
				{#if document.backlinks.length}
					{#each document.backlinks as backlink}
						<a class="bp-list-card" href={backlink.href ?? `/projects/${document.project?.slug ?? ''}`}>
							<p class="font-medium text-white">{backlink.title}</p>
							<p class="mt-1 text-sm text-base-content/55">{backlink.projectTitle ?? backlink.fromType}</p>
							{#if backlink.snippet}
								<p class="mt-2 text-sm text-base-content/45">{backlink.snippet}</p>
							{/if}
						</a>
					{/each}
				{:else}
					<p class="bp-empty">References to this note show up here.</p>
				{/if}
			</div>
		</div>
	</section>
</div>
