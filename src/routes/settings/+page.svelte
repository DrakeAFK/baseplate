<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	async function reindex() {
		await fetch('/api/reindex', { method: 'POST' });
	}
</script>

<div class="grid max-w-3xl gap-6">
	<section class="rounded-[2rem] border border-white/10 bg-base-200/50 p-6">
		<p class="text-xs uppercase tracking-[0.3em] text-base-content/45">Settings</p>
		<h1 class="mt-2 text-4xl font-semibold text-white">Operational, not ornamental.</h1>
	</section>

	<div class="rounded-[1.8rem] border border-white/10 bg-base-200/45 p-5">
		<div class="grid gap-4">
			<div>
				<p class="text-sm text-base-content/60">Workspace path</p>
				<p class="font-mono text-sm text-white">{data.workspaceDir}</p>
			</div>
			<div>
				<p class="text-sm text-base-content/60">Database status</p>
				<p class="text-white">{data.databaseStatus}</p>
			</div>
			<div>
				<p class="text-sm text-base-content/60">App info</p>
				<p class="text-white">{data.appInfo}</p>
			</div>
			<div class="pt-2">
				<button class="btn btn-primary" onclick={reindex}>Reindex workspace</button>
			</div>
		</div>
	</div>
</div>
