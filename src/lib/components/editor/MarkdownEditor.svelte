<script lang="ts">
	import { onDestroy, tick, untrack } from 'svelte';

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
	let lastSeenValue = $state(untrack(() => value));
	let renderedHtml = $state(untrack(() => previewHtml));
	let mode: 'edit' | 'preview' | 'split' = $state('split');
	let saveState: 'idle' | 'saving' | 'saved' | 'error' = $state('idle');
	let timer: ReturnType<typeof setTimeout> | null = null;
	let queuedSave = $state(false);
	let textarea = $state<HTMLTextAreaElement | null>(null);

	type SelectionSnapshot = {
		start: number;
		end: number;
		direction: 'forward' | 'backward' | 'none';
		scrollTop: number;
	} | null;

	function captureSelection(): SelectionSnapshot {
		if (!textarea || document.activeElement !== textarea) return null;
		return {
			start: textarea.selectionStart,
			end: textarea.selectionEnd,
			direction: textarea.selectionDirection ?? 'none',
			scrollTop: textarea.scrollTop
		};
	}

	async function restoreSelection(snapshot: SelectionSnapshot): Promise<void> {
		if (!snapshot) return;
		await tick();
		if (!textarea) return;
		const start = Math.min(snapshot.start, textarea.value.length);
		const end = Math.min(snapshot.end, textarea.value.length);
		textarea.focus({ preventScroll: true });
		textarea.setSelectionRange(start, end, snapshot.direction);
		textarea.scrollTop = snapshot.scrollTop;
	}

	$effect(() => {
		if (value !== lastSeenValue) {
			const hasLocalEdits = draft !== lastSavedValue;
			const selection = captureSelection();
			lastSeenValue = value;
			lastSavedValue = value;
			if (!hasLocalEdits) {
				draft = value;
				void restoreSelection(selection);
			}
		}
		renderedHtml = previewHtml;
	});

	function scheduleSave(): void {
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => void save(), 450);
	}

	async function save(): Promise<void> {
		if (saveState === 'saving') {
			queuedSave = true;
			return;
		}

		if (draft === lastSavedValue) return;

		saveState = 'saving';
		queuedSave = false;
		const snapshot = draft;

		try {
			const response = await fetch(saveUrl, {
				method,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ body: snapshot })
			});
			const payload = await response.json().catch(() => null);
			if (!response.ok) {
				saveState = 'error';
				return;
			}

			const nextValue = payload?.document?.body ?? snapshot;
			const changedDuringSave = draft !== snapshot;
			const selection = captureSelection();
			lastSavedValue = nextValue;
			lastSeenValue = nextValue;
			if (!changedDuringSave) {
				draft = nextValue;
				void restoreSelection(selection);
			}
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

		if (queuedSave || draft !== lastSavedValue) {
			queuedSave = false;
			void save();
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
			<p class="text-sm text-base-content/60">Autosaves in place. Markdown stays on disk, preview stays close, and edits are not reloaded out from under you.</p>
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

	<div class={`grid gap-4 ${mode === 'split' ? 'lg:grid-cols-2' : ''}`}>
		{#if mode !== 'preview'}
			<div class="grid gap-2">
				<textarea
					bind:this={textarea}
					class="textarea min-h-136 w-full resize-y border-white/10 bg-base-300/40 font-mono text-sm leading-7"
					bind:value={draft}
					oninput={scheduleSave}
					onblur={() => void save()}
				></textarea>
				<p class="text-xs text-base-content/45">Markdown autosaves after you pause and again when you leave the field.</p>
			</div>
		{/if}

		{#if mode !== 'edit'}
			<div class="prose prose-invert max-w-none rounded-[1.35rem] border border-white/10 bg-base-300/30 p-5">
				{@html renderedHtml}
			</div>
		{/if}
	</div>
</div>
