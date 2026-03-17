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

<div class="grid gap-6 xl:grid-cols-[minmax(0,1.18fr)_22rem]">
	<div class="grid gap-6">
		<section class="rounded-[2rem] border border-white/10 bg-base-200/50 p-6">
			<p class="text-xs uppercase tracking-[0.3em] text-base-content/45">Daily note</p>
			<h1 class="mt-2 text-4xl font-semibold text-white">{formatDate(document.dailyMeta.note_date)}</h1>
			<p class="mt-3 max-w-3xl text-base-content/65">
				{document.isToday
					? "This is today's note in its stable daily-note route, so it stays linkable and searchable like the rest of the workspace."
					: 'Past daily notes stay editable, searchable, and directly addressable so you can revisit earlier thinking without getting bounced into today.'}
			</p>
			<p class="mt-3 text-sm text-base-content/55">Updated {formatRelative(document.daily.note.updated_at)}</p>
		</section>

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
	</div>

	<div class="grid gap-6">
		<section class="rounded-[1.8rem] border border-white/10 bg-base-200/45 p-5">
			<h2 class="text-xl font-semibold text-white">Navigation</h2>
			<div class="mt-4 grid gap-3">
				<a class="rounded-[1.2rem] border border-white/10 bg-base-300/25 px-4 py-4 transition hover:border-info/30" href="/notes">
					<p class="font-medium text-white">Back to notes</p>
					<p class="mt-1 text-sm text-base-content/55">Return to the full note index and jump into another note or project artifact.</p>
				</a>
				<a class="rounded-[1.2rem] border border-white/10 bg-base-300/25 px-4 py-4 transition hover:border-info/30" href="/today">
					<p class="font-medium text-white">{document.isToday ? 'Open Today view' : 'Go to today'}</p>
					<p class="mt-1 text-sm text-base-content/55">
						{document.isToday
							? 'Switch back to the lighter Today page when you want the daily note plus workspace shortcuts.'
							: "Open the current day's note when you want to get back into today's work."}
					</p>
				</a>
			</div>
		</section>

		<section class="rounded-[1.8rem] border border-white/10 bg-base-200/45 p-5">
			<h2 class="text-xl font-semibold text-white">Backlinks</h2>
			<div class="mt-4 grid gap-3">
				{#if document.daily.backlinks.length}
					{#each document.daily.backlinks as backlink}
						<a class="rounded-[1.2rem] border border-white/10 bg-base-300/25 px-4 py-3 transition hover:border-info/30" href={backlink.href ?? '/notes'}>
							<p class="font-medium text-white">{backlink.title}</p>
							<p class="text-sm text-base-content/55">{backlink.projectTitle ?? backlink.fromType}</p>
							<p class="text-sm text-base-content/45">{backlink.snippet || 'No summary yet.'}</p>
						</a>
					{/each}
				{:else}
					<p class="rounded-[1.2rem] border border-dashed border-white/10 bg-base-300/15 px-4 py-5 text-sm text-base-content/45">
						References back into this daily note will appear here once other notes or tasks mention it.
					</p>
				{/if}
			</div>
		</section>
	</div>
</div>
