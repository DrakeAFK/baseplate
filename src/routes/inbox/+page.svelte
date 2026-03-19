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
	<section class="bp-hero p-6 md:p-7">
		<div class="bp-toolbar">
			<div>
				<p class="bp-kicker">Inbox</p>
				<h1 class="bp-page-title">Inbox</h1>
				<p class="bp-copy">Loose notes, fragments, and quick capture before something earns structure.</p>
			</div>
			<span class="bp-pill">{document.backlinks.length} backlinks</span>
		</div>
	</section>

	<div class="grid gap-6 xl:grid-cols-[minmax(0,1.18fr)_21rem]">
		<div class="grid gap-6">
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

			<section class="bp-panel p-5">
				<div class="relative z-10">
					<h2 class="text-xl font-semibold text-white">Backlinks</h2>
					<div class="mt-4 bp-list">
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
							<p class="bp-empty">References from project notes and tasks show up here.</p>
						{/if}
					</div>
				</div>
			</section>
		</div>

		<div class="grid gap-6">
			<section class="bp-panel p-5">
				<div class="relative z-10">
					<p class="bp-kicker">Next moves</p>
					<div class="mt-4 bp-list">
						<a class="bp-list-card" href="/today">
							<p class="font-medium text-white">Review today</p>
							<p class="mt-1 text-sm text-base-content/55">Move the work that belongs on today’s note.</p>
						</a>
						<a class="bp-list-card" href="/projects">
							<p class="font-medium text-white">Open a project</p>
							<p class="mt-1 text-sm text-base-content/55">Give durable work a proper home.</p>
						</a>
						<a class="bp-list-card" href="/search">
							<p class="font-medium text-white">Search workspace</p>
							<p class="mt-1 text-sm text-base-content/55">Jump straight to related notes, tasks, and meetings.</p>
						</a>
					</div>
				</div>
			</section>
		</div>
	</div>
</div>
