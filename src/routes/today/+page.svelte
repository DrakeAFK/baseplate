<script lang="ts">
	import MarkdownEditor from '$lib/components/editor/MarkdownEditor.svelte';
	import { formatDate } from '$lib/utils/dates';
	import { untrack } from 'svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let dashboard = $state(untrack(() => data));

	$effect(() => {
		dashboard = data;
	});
</script>

<div class="bp-page">
	<section class="bp-hero p-6 md:p-7">
		<div class="bp-toolbar">
			<div>
				<p class="bp-kicker">Today</p>
				<h1 class="bp-page-title">{formatDate(dashboard.dailyMeta.note_date)}</h1>
				<p class="bp-copy">Daily note and quick routes back into the workspace.</p>
			</div>
			<div class="bp-inline-stats">
				<span class="bp-pill">{dashboard.shortcuts.length} shortcuts</span>
				<span class="bp-pill">Daily note ready</span>
			</div>
		</div>
	</section>

	<div class="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_21rem]">
		<MarkdownEditor
			value={dashboard.daily.body}
			saveUrl={`/api/notes/${dashboard.daily.note.id}/content`}
			previewHtml={dashboard.daily.html}
			label="Daily note"
			onSaved={(payload) => {
				if (payload && typeof payload === 'object' && 'document' in payload) {
					dashboard = { ...dashboard, daily: payload.document as PageData['daily'] };
				}
			}}
		/>

		<div class="grid gap-6">
			<section class="bp-panel p-5">
				<div class="relative z-10">
					<p class="bp-kicker">Jump back in</p>
					<div class="mt-4 bp-list">
						{#each dashboard.shortcuts as shortcut}
							<a class="bp-list-card" href={shortcut.href}>
								<p class="font-medium text-white">{shortcut.title}</p>
								<p class="mt-1 text-sm text-base-content/55">{shortcut.description}</p>
							</a>
						{/each}
					</div>
				</div>
			</section>

			<section class="bp-panel p-5">
				<div class="relative z-10">
					<p class="bp-kicker">Workspace links</p>
					<div class="mt-4 bp-list">
						<a class="bp-list-card" href="/projects">
							<p class="font-medium text-white">Projects</p>
							<p class="mt-1 text-sm text-base-content/55">Open the full project index.</p>
						</a>
						<a class="bp-list-card" href="/notes">
							<p class="font-medium text-white">Notes</p>
							<p class="mt-1 text-sm text-base-content/55">Scan docs, decisions, meetings, and daily notes.</p>
						</a>
						<a class="bp-list-card" href="/inbox">
							<p class="font-medium text-white">Inbox</p>
							<p class="mt-1 text-sm text-base-content/55">Capture rough work before it earns structure.</p>
						</a>
					</div>
				</div>
			</section>
		</div>
	</div>
</div>
