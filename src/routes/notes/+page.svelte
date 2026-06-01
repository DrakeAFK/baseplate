<script lang="ts">
	import type { NoteKind, NotesIndexItem } from '$lib/types/models';
	import { formatDate, formatRelative, todayDate } from '$lib/utils/dates';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let q = $state('');
	let kind = $state<NoteKind | 'all'>('all');
	let projectId = $state('');

	const orderedKinds: NoteKind[] = ['project_home', 'note', 'doc', 'decision', 'meeting', 'daily', 'inbox'];

	function kindLabel(value: NoteKind): string {
		if (value === 'project_home') return 'Project overviews';
		if (value === 'meeting') return 'Meeting notes';
		if (value === 'daily') return 'Daily notes';
		if (value === 'inbox') return 'Inbox';
		return `${value}s`;
	}

	function itemKindLabel(value: NoteKind): string {
		if (value === 'project_home') return 'Project overview';
		if (value === 'meeting') return 'Meeting note';
		if (value === 'daily') return 'Daily note';
		if (value === 'inbox') return 'Inbox';
		return value;
	}

	function noteContext(item: NotesIndexItem): string {
		if (item.note.kind === 'daily') {
			const noteDate = item.dailyNoteDate ?? item.note.title;
			return noteDate === todayDate() ? 'Today' : formatDate(noteDate);
		}
		if (item.note.kind === 'inbox') return 'Workspace';
		return item.project?.title ?? 'Workspace';
	}

	function noteTitle(item: NotesIndexItem): string {
		if (item.note.kind === 'daily') {
			const noteDate = item.dailyNoteDate ?? item.note.title;
			return formatDate(noteDate);
		}
		return item.note.title;
	}

	const filteredNotes = $derived(
		data.notes.filter((item) => {
			if (kind !== 'all' && item.note.kind !== kind) return false;
			if (projectId && item.project?.id !== projectId) return false;

			const query = q.trim().toLowerCase();
			if (!query) return true;

			const haystack = [item.note.title, item.note.excerpt, item.project?.title ?? '', item.note.kind].join(' ').toLowerCase();
			return haystack.includes(query);
		})
	);

	const noteGroups = $derived(
		(kind === 'all' ? orderedKinds : [kind]).reduce<Array<{ kind: NoteKind; label: string; items: NotesIndexItem[] }>>((groups, currentKind) => {
			const items = filteredNotes.filter((item) => item.note.kind === currentKind);
			if (!items.length) return groups;
			groups.push({
				kind: currentKind,
				label: kindLabel(currentKind),
				items
			});
			return groups;
		}, [])
	);
</script>

<div class="bp-page">
	<section class="bp-hero pb-4">
		<div class="bp-toolbar">
			<div>
				<p class="bp-kicker">Notes</p>
				<h1 class="bp-page-title">Notes</h1>
			</div>
			<span class="bp-pill">{filteredNotes.length} results</span>
		</div>
	</section>

	<section class="bp-panel p-3">
		<div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_14rem_16rem]">
			<input class="input input-bordered w-full" bind:value={q} placeholder="Filter by title, excerpt, project, or kind" />
			<select class="select select-bordered w-full" bind:value={kind}>
				<option value="all">All note types</option>
				{#each orderedKinds as option}
					<option value={option}>{kindLabel(option)}</option>
				{/each}
			</select>
			<select class="select select-bordered w-full" bind:value={projectId}>
				<option value="">All projects and workspace notes</option>
				{#each data.projects as project}
					<option value={project.id}>{project.title}</option>
				{/each}
			</select>
		</div>
	</section>

	{#if noteGroups.length}
		<div class="grid gap-4">
			{#each noteGroups as group}
				<section class="grid gap-4">
					<div class="flex items-center justify-between gap-3">
						<h2 class="bp-section-title">{group.label}</h2>
						<span class="bp-meta">{group.items.length}</span>
					</div>
					<section class="bp-panel overflow-hidden">
						<table class="bp-data-table">
							<thead>
								<tr>
									<th class="w-[44%]">Title</th>
									<th>Context</th>
									<th>Kind</th>
									<th>Updated</th>
								</tr>
							</thead>
							<tbody>
								{#each group.items as item}
									<tr>
										<td>
											<a class="block min-w-0" href={item.href ?? '/notes'}>
												<p class="truncate font-medium text-white">{noteTitle(item)}</p>
												{#if item.note.excerpt}
													<p class="mt-1 line-clamp-2 text-sm text-base-content/55">{item.note.excerpt}</p>
												{/if}
											</a>
										</td>
										<td>
											<p class="truncate text-sm text-base-content/70">{noteContext(item)}</p>
										</td>
										<td>
											<span class="badge badge-ghost">{itemKindLabel(item.note.kind)}</span>
										</td>
										<td>
											<p class="bp-meta">{formatRelative(item.note.updated_at)}</p>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</section>
				</section>
			{/each}
		</div>
	{:else}
		<div class="bp-empty p-10 text-center">No notes match the current filters.</div>
	{/if}
</div>
