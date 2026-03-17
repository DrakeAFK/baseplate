	<script lang="ts">
	import MarkdownEditor from '$lib/components/editor/MarkdownEditor.svelte';
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
			<p class="text-xs uppercase tracking-[0.3em] text-base-content/45">Inbox</p>
			<h1 class="mt-2 text-4xl font-semibold text-white">Capture first. Sort later.</h1>
			<p class="mt-3 max-w-3xl text-base-content/65">
				This is one global markdown note for raw thinking, snippets, loose checklists, and links you do not want to lose. It stays on disk, stays searchable, and does not disappear unless you remove it.
			</p>
		</section>

		<MarkdownEditor
			value={document.body}
			saveUrl={`/api/notes/${document.note.id}/content`}
			previewHtml={document.html}
			label="Inbox note"
			onSaved={(payload) => {
				if (payload && typeof payload === 'object' && 'document' in payload) {
					document = payload.document as PageData;
				}
			}}
		/>

		<div class="rounded-[1.8rem] border border-white/10 bg-base-200/45 p-5">
			<h2 class="text-xl font-semibold text-white">Backlinks</h2>
			<div class="mt-4 grid gap-3">
				{#if document.backlinks.length}
					{#each document.backlinks as backlink}
						<a class="rounded-[1.2rem] border border-white/10 bg-base-300/25 px-4 py-3 transition hover:border-info/30" href={backlink.href ?? '/inbox'}>
							<p class="font-medium text-white">{backlink.title}</p>
							<p class="text-sm text-base-content/55">{backlink.projectTitle ?? backlink.fromType}</p>
							<p class="text-sm text-base-content/45">{backlink.snippet || 'No summary yet.'}</p>
						</a>
					{/each}
				{:else}
					<p class="rounded-[1.2rem] border border-dashed border-white/10 bg-base-300/15 px-4 py-5 text-sm text-base-content/45">
						If project notes or tasks reference the inbox, those links show up here.
					</p>
				{/if}
			</div>
		</div>
	</div>

	<div class="grid gap-6">
		<section class="rounded-[1.8rem] border border-white/10 bg-base-200/45 p-5">
			<h2 class="text-xl font-semibold text-white">How to use it</h2>
			<div class="mt-4 grid gap-3 text-sm text-base-content/60">
				<p>Keep rough capture here when you are moving fast and do not want to choose a project yet.</p>
				<p>Promote durable work into a project note, meeting, or task once it deserves structure.</p>
				<p>Leave ephemeral scraps here if they are still useful as searchable reference later.</p>
			</div>
		</section>

		<section class="rounded-[1.8rem] border border-white/10 bg-base-200/45 p-5">
			<h2 class="text-xl font-semibold text-white">Next moves</h2>
			<div class="mt-4 grid gap-3">
				<a class="rounded-[1.2rem] border border-white/10 bg-base-300/25 px-4 py-4 transition hover:border-info/30" href="/today">
					<p class="font-medium text-white">Review today</p>
					<p class="mt-1 text-sm text-base-content/55">Use the daily note when the inbox item has turned into actual work for today.</p>
				</a>
				<a class="rounded-[1.2rem] border border-white/10 bg-base-300/25 px-4 py-4 transition hover:border-info/30" href="/projects">
					<p class="font-medium text-white">Move into a project</p>
					<p class="mt-1 text-sm text-base-content/55">Open a project when the idea needs a durable brief, meeting trail, or task queue.</p>
				</a>
				<a class="rounded-[1.2rem] border border-white/10 bg-base-300/25 px-4 py-4 transition hover:border-info/30" href="/search">
					<p class="font-medium text-white">Search everything</p>
					<p class="mt-1 text-sm text-base-content/55">The inbox is indexed like the rest of the workspace, so rough notes remain retrievable.</p>
				</a>
			</div>
		</section>
	</div>
</div>
