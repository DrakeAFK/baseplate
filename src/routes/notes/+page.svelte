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

<div class="grid gap-6">
	<section class="rounded-[2rem] border border-white/10 bg-base-200/50 p-6">
		<p class="text-xs uppercase tracking-[0.3em] text-base-content/45">Notes</p>
		<h1 class="mt-2 text-4xl font-semibold text-white">Everything written down, with its context intact.</h1>
		<p class="mt-3 max-w-3xl text-base-content/65">
			This is the more usable version of the old notes modal: one place to scan notes, docs, decisions, meeting notes, and workspace notes, then jump straight to where each one lives.
		</p>
	</section>

	<section class="rounded-[1.8rem] border border-white/10 bg-base-200/45 p-5">
		<div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_14rem_16rem]">
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
		<div class="grid gap-6">
			{#each noteGroups as group}
				<section class="grid gap-4">
					<div class="flex items-center justify-between gap-3">
						<h2 class="text-xl font-semibold text-white">{group.label}</h2>
						<span class="text-xs uppercase tracking-[0.24em] text-base-content/45">{group.items.length}</span>
					</div>
					<div class="grid gap-3 lg:grid-cols-2">
						{#each group.items as item}
							<a class="rounded-[1.4rem] border border-white/10 bg-base-200/45 px-5 py-4 transition hover:border-info/30" href={item.href ?? '/notes'}>
								<div class="flex flex-wrap items-center justify-between gap-3">
									<div>
										<p class="font-medium text-white">{noteTitle(item)}</p>
										<p class="text-sm text-base-content/60">{noteContext(item)} · {itemKindLabel(item.note.kind)}</p>
									</div>
									<p class="text-xs text-base-content/45">{formatRelative(item.note.updated_at)}</p>
								</div>
								<p class="mt-2 text-sm text-base-content/55">{item.note.excerpt || 'No summary yet.'}</p>
							</a>
						{/each}
					</div>
				</section>
			{/each}
		</div>
	{:else}
		<div class="rounded-[1.8rem] border border-dashed border-white/10 bg-base-200/35 p-10 text-center text-base-content/55">
			No notes match the current filters.
		</div>
	{/if}
</div>
