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
		urgent: '🔴',
		high: '🟠',
		medium: '🟡',
		low: '⚪'
	};
</script>

<div class="bp-page">
	<section class="bp-hero p-6 md:p-7">
		<div class="bp-toolbar">
			<div>
				<p class="bp-kicker">Today</p>
				<h1 class="bp-page-title">{formatDate(dashboard.dailyMeta.note_date)}</h1>
				<p class="bp-copy">Daily note, today's tasks, and a link to yesterday.</p>
			</div>
			<div class="bp-inline-stats">
				<span class="bp-pill font-bold text-white">{dashboard.todayTasks.length} tasks today</span>
				{#if dashboard.yesterdayNote}
					<a 
						class="bp-pill bg-info/10 hover:bg-info/20 hover:border-info/40 transition-all font-bold text-info" 
						href={`/notes/daily/${dashboard.yesterdayNote.date}`}
						title={`Go to ${dashboard.yesterdayNote.date}`}
					>
						← Yesterday's Note
					</a>
				{/if}
			</div>
		</div>
	</section>

	<div class="grid gap-6 lg:grid-cols-2 xl:grid-cols-[1fr_22rem]">
		<!-- Daily note editor: always full width on small, 1st column on large -->
		<div class="lg:col-span-1 xl:col-span-1">
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

		<!-- Dashboard Widgets: 2nd column on large, full-width grid on medium -->
		<div class="grid gap-6 content-start lg:col-span-1 xl:col-span-1">
			<!-- My Tasks for today -->
			<section class="bp-panel p-5 min-w-0">
				<div class="relative z-10">
					<p class="bp-kicker text-info font-bold">My tasks today</p>
					<p class="mt-2 text-sm text-base-content/55">
						Tasks scheduled or due today.
					</p>

					{#if dashboard.todayTasks.length}
						<div class="mt-4 bp-list">
							{#each dashboard.todayTasks as task}
								<a
									class={`bp-list-card block border-l-2 overflow-hidden transition-transform hover:translate-x-1 ${statusColors[task.status] ?? ''}`}
									href={`/projects/${task.projectSlug}#task-${task.id}`}
								>
									<div class="flex items-start gap-3">
										<span class="mt-1 flex-shrink-0 text-xs">{priorityLabels[task.priority] ?? '⚪'}</span>
										<p class="font-medium leading-snug text-white">{task.title}</p>
									</div>
									<div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.7rem] text-base-content/50">
										<span class="truncate">{task.projectTitle}</span>
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
				</div>
			</section>

			<!-- Yesterday reference -->
			{#if dashboard.yesterdayNote}
				<section class="bp-panel p-5 min-w-0">
					<div class="relative z-10">
						<p class="bp-kicker font-bold text-secondary">Yesterday</p>
						<a class="bp-list-card mt-3 block hover:border-secondary/40" href={`/notes/daily/${dashboard.yesterdayNote.date}`}>
							<p class="font-bold text-white text-lg">← {formatDate(dashboard.yesterdayNote.date)}</p>
							<p class="mt-1 text-sm text-base-content/55">
								Review yesterday's notes and pull items forward.
							</p>
						</a>
					</div>
				</section>
			{/if}
		</div>
	</div>
</div>
