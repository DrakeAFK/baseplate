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

	const statusColors: Record<string, string> = {
		in_progress: 'border-info/40 bg-info/8',
		blocked: 'border-error/40 bg-error/8',
		todo: 'border-base-content/20 bg-base-content/5'
	};

	const priorityLabels: Record<string, string> = {
		urgent: 'urgent',
		high: 'high',
		medium: 'med',
		low: 'low'
	};
</script>

<div class="bp-page">
	<section class="bp-hero pb-4">
		<div class="bp-toolbar">
			<div>
				<p class="bp-kicker">Today</p>
				<h1 class="bp-page-title">{formatDate(dashboard.dailyMeta.note_date)}</h1>
			</div>
			<div class="bp-inline-stats">
				<span class="bp-pill bp-pill-blue">{dashboard.todayTasks.length} tasks today</span>
				{#if dashboard.yesterdayNote}
					<a 
						class="bp-pill hover:border-info/40 hover:text-white" 
						href={`/notes/daily/${dashboard.yesterdayNote.date}`}
						title={`Go to ${dashboard.yesterdayNote.date}`}
					>
						Yesterday
					</a>
				{/if}
			</div>
		</div>
	</section>

	<div class="bp-page-grid">
		<div>
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

		<div class="grid content-start gap-4">
			<section class="bp-panel min-w-0 p-4">
				<div class="bp-toolbar">
					<p class="bp-kicker">Due / scheduled</p>
					<span class="bp-meta">{dashboard.todayTasks.length}</span>
				</div>
					{#if dashboard.todayTasks.length}
						<div class="bp-list mt-3">
							{#each dashboard.todayTasks as task}
								<a
									class={`bp-list-card block border-l-2 overflow-hidden ${statusColors[task.status] ?? ''}`}
									href={`/projects/${task.projectSlug}#task-${task.id}`}
								>
									<div class="flex items-start gap-3">
										<span class={`bp-priority-dot mt-1 ${task.priority}`} title={`${task.priority} priority`}></span>
										<div class="min-w-0">
											<p class="truncate font-medium leading-snug text-white">{task.title}</p>
											<p class="mt-1 truncate text-sm text-base-content/55">{task.projectTitle}</p>
										</div>
									</div>
									<div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.7rem] text-base-content/50">
										<span class="bp-meta">{priorityLabels[task.priority] ?? task.priority}</span>
										{#if task.due_at}
											<span class="font-bold text-info">due {formatDate(task.due_at)}</span>
										{/if}
									</div>
								</a>
							{/each}
						</div>
					{:else}
						<p class="bp-empty mt-4 text-sm">
							No tasks scheduled.
						</p>
					{/if}
			</section>

			{#if dashboard.yesterdayNote}
				<section class="bp-panel min-w-0 p-4">
					<p class="bp-kicker">Previous daily</p>
					<div class="bp-list mt-3">
						<a class="bp-list-card block hover:border-secondary/40" href={`/notes/daily/${dashboard.yesterdayNote.date}`}>
							<p class="font-medium text-white">{formatDate(dashboard.yesterdayNote.date)}</p>
							<p class="mt-1 text-sm text-base-content/55">Open note</p>
						</a>
					</div>
				</section>
			{/if}
		</div>
	</div>
</div>
