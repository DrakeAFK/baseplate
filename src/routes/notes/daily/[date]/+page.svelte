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
	<section class="bp-hero p-6 md:p-7">
		<div class="bp-toolbar">
			<div>
				<p class="bp-kicker">Daily note</p>
				<h1 class="bp-page-title">{formatDate(document.dailyMeta.note_date)}</h1>
				<p class="bp-copy">{document.isToday ? 'Today’s note, available from its permanent route.' : 'A past daily note, still editable and fully linked.'}</p>
				<p class="mt-4 text-sm text-base-content/55">Updated {formatRelative(document.daily.note.updated_at)}</p>
			</div>
			<span class="bp-pill">{document.daily.backlinks.length} backlinks</span>
		</div>
	</section>

	<div class="grid gap-6 xl:grid-cols-[minmax(0,1.18fr)_21rem]">
		<MarkdownEditor
			value={document.daily.body}
			saveUrl={`/api/notes/${document.daily.note.id}/content`}
			previewHtml={document.daily.html}
			label={`Daily note · ${formatDate(document.dailyMeta.note_date)}`}
			onSaved={(payload) => {
				if (payload && typeof payload === 'object' && 'document' in payload) {
					document = { ...document, daily: payload.document as PageData['daily'] };
				}
			}}
		/>

		<div class="grid gap-6">
			<section class="bp-panel p-5">
				<div class="relative z-10">
					<p class="bp-kicker">Navigation</p>
					<div class="mt-4 bp-list">
						<a class="bp-list-card" href="/notes">
							<p class="font-medium text-white">Back to notes</p>
							<p class="mt-1 text-sm text-base-content/55">Return to the full note index.</p>
						</a>
						<a class="bp-list-card" href="/today">
							<p class="font-medium text-white">{document.isToday ? 'Open Today view' : 'Go to today'}</p>
							<p class="mt-1 text-sm text-base-content/55">{document.isToday ? 'Open the lighter daily workspace.' : 'Jump back to the current day.'}</p>
						</a>
					</div>
				</div>
			</section>

			<section class="bp-panel p-5">
				<div class="relative z-10">
					<h2 class="text-xl font-semibold text-white">Backlinks</h2>
					<div class="mt-4 bp-list">
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
							<p class="bp-empty">References to this daily note show up here.</p>
						{/if}
					</div>
				</div>
			</section>
		</div>
	</div>
</div>
