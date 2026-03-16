<script lang="ts">
	import type { PageData } from './$types';
	import { formatRelative } from '$lib/utils/dates';

	let { data }: { data: PageData } = $props();
	const statuses = ['active', 'on_hold', 'completed', 'archived'];
</script>

<div class="grid gap-6">
	<section class="flex flex-wrap items-end justify-between gap-4 rounded-[2rem] border border-white/10 bg-base-200/50 p-6">
		<div>
			<p class="text-xs uppercase tracking-[0.3em] text-base-content/45">Projects</p>
			<h1 class="mt-2 text-4xl font-semibold text-white">Everything durable belongs to a project.</h1>
		</div>
		<a class="btn btn-primary" href="/projects/new">New project</a>
	</section>

	<div class="tabs tabs-boxed w-fit bg-base-200/50">
		{#each statuses as status}
			<a class="tab" class:tab-active={data.status === status} href={`/projects?status=${status}`}>{status.replace('_', ' ')}</a>
		{/each}
	</div>

	<div class="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
		{#each data.projects as project}
			<a class="rounded-[1.8rem] border border-white/10 bg-base-200/45 p-5 transition hover:-translate-y-0.5 hover:border-info/30" href={`/projects/${project.slug}`}>
				<div class="flex items-start justify-between gap-4">
					<div>
						<h2 class="text-2xl font-semibold text-white">{project.title}</h2>
						<p class="mt-1 text-sm text-base-content/60">{project.summary || 'No summary yet.'}</p>
					</div>
					<div class="grid gap-2 text-right">
						<span class="badge badge-outline">{project.kind}</span>
						<span class="badge badge-ghost">{project.status}</span>
					</div>
				</div>
				<p class="mt-5 text-xs uppercase tracking-[0.25em] text-base-content/45">Updated {formatRelative(project.updated_at)}</p>
			</a>
		{/each}
	</div>
</div>
