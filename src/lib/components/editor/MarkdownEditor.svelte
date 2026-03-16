<script lang="ts">
	import { onDestroy, untrack } from 'svelte';

	let {
		value,
		saveUrl,
		method = 'PUT',
		label = 'Markdown',
		previewHtml = '',
		onSaved = (_payload: unknown) => {}
	}: {
		value: string;
		saveUrl: string;
		method?: 'PUT' | 'PATCH';
		label?: string;
		previewHtml?: string;
		onSaved?: (payload: unknown) => void;
	} = $props();

	let draft = $state(untrack(() => value));
	let lastSavedValue = $state(untrack(() => value));
	let renderedHtml = $state(untrack(() => previewHtml));
	let mode: 'edit' | 'preview' | 'split' = $state('split');
	let saveState: 'idle' | 'saving' | 'saved' | 'error' = $state('idle');
	let timer: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		if (value !== lastSavedValue) {
			draft = value;
			lastSavedValue = value;
		}
		renderedHtml = previewHtml;
	});

	function scheduleSave() {
		if (timer) clearTimeout(timer);
		timer = setTimeout(save, 650);
	}

	async function save() {
		if (draft === value) return;
		saveState = 'saving';
		try {
			const response = await fetch(saveUrl, {
				method,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ body: draft })
			});
			const payload = await response.json().catch(() => null);
			if (!response.ok) {
				saveState = 'error';
				return;
			}
			value = payload?.document?.body ?? draft;
			lastSavedValue = value;
			draft = value;
			renderedHtml = payload?.document?.html ?? renderedHtml;
			onSaved(payload);
			saveState = 'saved';
			setTimeout(() => {
				if (saveState === 'saved') saveState = 'idle';
			}, 1200);
		} catch {
			saveState = 'error';
			return;
		}
	}

	onDestroy(() => {
		if (timer) clearTimeout(timer);
	});
</script>

<div class="grid gap-4 rounded-[1.75rem] border border-white/10 bg-base-200/60 p-4">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<p class="text-xs uppercase tracking-[0.3em] text-base-content/50">{label}</p>
			<p class="text-sm text-base-content/60">Autosaves in place. Stable links and frontmatter are preserved.</p>
		</div>
		<div class="flex items-center gap-2">
			<div class="join">
				<button class="btn btn-sm join-item" class:btn-active={mode === 'edit'} onclick={() => (mode = 'edit')}>Edit</button>
				<button class="btn btn-sm join-item" class:btn-active={mode === 'split'} onclick={() => (mode = 'split')}>Split</button>
				<button class="btn btn-sm join-item" class:btn-active={mode === 'preview'} onclick={() => (mode = 'preview')}>Preview</button>
			</div>
			<span class="text-xs text-base-content/60">
				{saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Save failed' : 'Idle'}
			</span>
		</div>
	</div>

	<div class="grid gap-4 lg:grid-cols-2">
		{#if mode !== 'preview'}
			<textarea
				class="textarea min-h-[28rem] w-full resize-y border-white/10 bg-base-300/40 font-mono text-sm leading-7"
				bind:value={draft}
				oninput={scheduleSave}
				onblur={save}
			></textarea>
		{/if}

		{#if mode !== 'edit'}
			<div class="prose prose-invert max-w-none rounded-[1.35rem] border border-white/10 bg-base-300/30 p-5">
				{@html renderedHtml}
			</div>
		{/if}
	</div>
</div>
