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

<div class="grid gap-6 xl:grid-cols-[minmax(0,1.22fr)_22rem]">
	<div class="grid gap-6">
		<section class="rounded-[2rem] border border-white/10 bg-base-200/50 p-6">
			<p class="text-xs uppercase tracking-[0.3em] text-base-content/45">Today</p>
			<h1 class="mt-2 text-4xl font-semibold text-white">{formatDate(dashboard.dailyMeta.note_date)}</h1>
			<p class="mt-3 max-w-3xl text-base-content/65">
				Keep the day anchored in one note. When you need the rest of the workspace, step into it deliberately instead of carrying a second dashboard around.
			</p>
		</section>

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
	</div>

	<div class="grid gap-6">
		<section class="rounded-[1.8rem] border border-white/10 bg-base-200/45 p-5">
			<h2 class="text-xl font-semibold text-white">Jump back in</h2>
			<p class="mt-2 text-sm text-base-content/60">
				Use the daily note as the center of gravity, then open the part of the workspace that actually needs your attention.
			</p>
			<div class="mt-4 grid gap-3">
				{#each dashboard.shortcuts as shortcut}
					<a class="rounded-[1.25rem] border border-white/10 bg-base-300/25 px-4 py-4 transition hover:border-info/30" href={shortcut.href}>
						<p class="font-medium text-white">{shortcut.title}</p>
						<p class="mt-1 text-sm text-base-content/55">{shortcut.description}</p>
					</a>
				{/each}
			</div>
		</section>

		<section class="rounded-[1.8rem] border border-white/10 bg-base-200/45 p-5">
			<h2 class="text-xl font-semibold text-white">A lighter Today</h2>
			<div class="mt-4 grid gap-3 text-sm text-base-content/60">
				<p>The project dashboards still hold the task queues, meeting history, and durable notes.</p>
				<p>The sidebar pulse keeps active projects and open tasks one click away when you need a fast scan.</p>
				<p>The inbox stays available for rough capture when something matters but does not belong in today yet.</p>
			</div>
		</section>
	</div>
</div>
