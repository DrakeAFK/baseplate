<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import MarkdownEditor from '$lib/components/editor/MarkdownEditor.svelte';

	let { data }: { data: PageData } = $props();
</script>

<div class="grid gap-6">
	<section class="rounded-[2rem] border border-white/10 bg-base-200/50 p-6">
		<p class="text-xs uppercase tracking-[0.3em] text-base-content/45">Inbox</p>
		<h1 class="mt-2 text-4xl font-semibold text-white">Capture it before it evaporates.</h1>
		<p class="mt-3 max-w-2xl text-base-content/65">This is one global markdown note, indexed and linkable like everything else.</p>
	</section>

	<MarkdownEditor value={data.body} saveUrl={`/api/notes/${data.note.id}/content`} previewHtml={data.html} label="Inbox note" onSaved={() => invalidateAll()} />
</div>
