<script lang="ts">
	import { goto } from '$app/navigation';

	let title = $state('');
	let kind = $state<'standard' | 'perpetual'>('standard');
	let summary = $state('');
	let error = $state('');
	let saving = $state(false);

	async function submit() {
		saving = true;
		error = '';
		const response = await fetch('/api/projects', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ title, kind, summary })
		});
		const payload = await response.json();
		saving = false;
		if (!response.ok) {
			error = payload.error ?? 'Unable to create project';
			return;
		}
		await goto(`/projects/${payload.project.slug}`);
	}
</script>

<div class="bp-page mx-auto max-w-4xl">
	<section class="bp-hero p-6 md:p-7">
		<div>
			<p class="bp-kicker">Create project</p>
			<h1 class="bp-page-title">Create project</h1>
			<p class="bp-copy">Start a new workspace with a clear title and scope.</p>
		</div>
	</section>

	<section class="bp-panel p-6 md:p-8">
		<div class="relative z-10 grid gap-5">
			<label class="grid gap-2">
				<span class="bp-meta">Title</span>
				<input class="input input-bordered w-full" bind:value={title} placeholder="RequestBridge" />
			</label>
			<div class="grid gap-5 md:grid-cols-[14rem_minmax(0,1fr)]">
				<label class="grid gap-2">
					<span class="bp-meta">Kind</span>
					<select class="select select-bordered" bind:value={kind}>
						<option value="standard">Standard</option>
						<option value="perpetual">Perpetual</option>
					</select>
				</label>
				<label class="grid gap-2">
					<span class="bp-meta">Summary</span>
					<textarea class="textarea textarea-bordered min-h-32" bind:value={summary} placeholder="Scope, owner, and current direction"></textarea>
				</label>
			</div>
			{#if error}
				<p class="text-sm text-error">{error}</p>
			{/if}
			<div class="flex justify-end pt-2">
				<button class="btn btn-primary" onclick={submit} disabled={saving || !title.trim()}>
					{saving ? 'Creating…' : 'Create project'}
				</button>
			</div>
		</div>
	</section>
</div>
