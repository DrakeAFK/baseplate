<script lang="ts">
	import MarkdownEditor from '$lib/components/editor/MarkdownEditor.svelte';
	import { formatDate, formatRelative } from '$lib/utils/dates';
	import { untrack } from 'svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let document = $state(untrack(() => data));

	$effect(() => {
		document = data;
	});
</script>

<div class="bp-page">
	<section class="bp-hero pb-4">
		<div class="bp-toolbar">
			<div>
				<p class="bp-kicker">Daily note</p>
				<h1 class="bp-page-title">{formatDate(document.dailyMeta.note_date)}</h1>
				<p class="mt-3 text-sm text-base-content/55">Updated {formatRelative(document.daily.note.updated_at)}</p>
			</div>
			<span class="bp-pill">{document.daily.backlinks.length} backlinks</span>
		</div>
	</section>

	<div class="bp-page-grid">
		<MarkdownEditor
			value={document.daily.body}
			saveUrl={`/api/notes/${document.daily.note.id}/content`}
			previewHtml={document.daily.html}
			label={`Daily note / ${formatDate(document.dailyMeta.note_date)}`}
			onSaved={(payload) => {
				if (payload && typeof payload === 'object' && 'document' in payload) {
					document = { ...document, daily: payload.document as PageData['daily'] };
				}
			}}
		/>

		<div class="grid content-start gap-4">
			<section class="bp-panel p-4">
				<p class="bp-kicker">Jump</p>
				<div class="bp-list mt-4">
					<a class="bp-list-card" href="/notes">
						<p class="font-medium text-white">Notes</p>
					</a>
					<a class="bp-list-card" href="/today">
						<p class="font-medium text-white">{document.isToday ? 'Today view' : 'Today'}</p>
					</a>
				</div>
			</section>

			<section class="bp-panel p-4">
				<h2 class="bp-section-title">Backlinks</h2>
				<div class="bp-list mt-4">
					{#if document.daily.backlinks.length}
						{#each document.daily.backlinks as backlink}
							<a class="bp-list-card" href={backlink.href ?? '/notes'}>
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
</div>
