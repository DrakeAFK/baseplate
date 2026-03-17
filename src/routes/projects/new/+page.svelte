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

<div class="mx-auto flex max-w-3xl flex-col gap-6">
	<div>
		<p class="text-sm uppercase tracking-[0.3em] text-base-content/50">Create project</p>
		<h1 class="text-4xl font-semibold text-base-content">Start a durable workspace</h1>
	</div>

	<div class="rounded-4xl border border-white/10 bg-base-200/70 p-8 shadow-[0_20px_80px_rgba(0,0,0,0.25)]">
		<div class="grid gap-5">
			<label class="grid gap-2">
				<span class="text-sm text-base-content/70">Title</span>
				<input class="input input-bordered w-full" bind:value={title} placeholder="RequestBridge" />
			</label>
			<label class="grid gap-2">
				<span class="text-sm text-base-content/70">Kind</span>
				<select class="select select-bordered" bind:value={kind}>
					<option value="standard">Standard</option>
					<option value="perpetual">Perpetual</option>
				</select>
			</label>
			<label class="grid gap-2">
				<span class="text-sm text-base-content/70">Summary</span>
				<textarea class="textarea textarea-bordered min-h-28" bind:value={summary}></textarea>
			</label>
			{#if error}
				<p class="text-sm text-error">{error}</p>
			{/if}
			<div class="flex justify-end">
				<button class="btn btn-primary" onclick={submit} disabled={saving || !title.trim()}>
					{saving ? 'Creating…' : 'Create project'}
				</button>
			</div>
		</div>
	</div>
</div>
