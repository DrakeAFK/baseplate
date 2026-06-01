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

<div class="bp-page">
	<section class="bp-hero pb-4">
		<div class="bp-toolbar">
			<div>
				<p class="bp-kicker">Inbox</p>
				<h1 class="bp-page-title">Inbox</h1>
			</div>
			<span class="bp-pill">{document.backlinks.length} backlinks</span>
		</div>
	</section>

	<div class="bp-page-grid">
		<div class="grid gap-4">
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

			<section class="bp-panel p-4">
				<h2 class="bp-section-title">Backlinks</h2>
				<div class="bp-list mt-4">
					{#if document.backlinks.length}
						{#each document.backlinks as backlink}
							<a class="bp-list-card" href={backlink.href ?? '/inbox'}>
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

		<div class="grid content-start gap-4">
			<section class="bp-panel p-4">
				<p class="bp-kicker">Jump</p>
				<div class="bp-list mt-4">
					<a class="bp-list-card" href="/today">
						<p class="font-medium text-white">Today</p>
					</a>
					<a class="bp-list-card" href="/projects">
						<p class="font-medium text-white">Projects</p>
					</a>
					<a class="bp-list-card" href="/search">
						<p class="font-medium text-white">Search</p>
					</a>
				</div>
			</section>
		</div>
	</div>
</div>
