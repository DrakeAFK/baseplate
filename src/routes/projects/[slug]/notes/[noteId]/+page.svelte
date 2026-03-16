<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import MarkdownEditor from '$lib/components/editor/MarkdownEditor.svelte';
	import { formatRelative } from '$lib/utils/dates';

	let { data }: { data: PageData } = $props();
</script>

<div class="grid gap-6">
	<section class="rounded-[2rem] border border-white/10 bg-base-200/50 p-6">
		<div class="flex flex-wrap items-start justify-between gap-4">
			<div>
				<p class="text-xs uppercase tracking-[0.3em] text-base-content/45">{data.note.kind.replace('_', ' ')}</p>
				<h1 class="mt-2 text-4xl font-semibold text-white">{data.note.title}</h1>
				<p class="mt-2 text-base-content/65">{data.project?.title} · Updated {formatRelative(data.note.updated_at)}</p>
			</div>
			{#if data.project}
				<a class="btn btn-sm" href={`/projects/${data.project.slug}`}>Back to project</a>
			{/if}
		</div>
	</section>

	<MarkdownEditor value={data.body} saveUrl={`/api/notes/${data.note.id}/content`} previewHtml={data.html} label="Note body" onSaved={() => invalidateAll()} />

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
