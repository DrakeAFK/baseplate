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
	const lineCount = $derived(draft ? draft.split('\n').length : 1);
	const charCount = $derived(draft.length);

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

	function handleKeydown(event: KeyboardEvent): void {
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
			event.preventDefault();
			void save();
		}
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

<div class="bp-editor-shell">
	<div class="bp-editor-toolbar">
		<div class="flex flex-wrap items-center gap-3">
			<p class="bp-kicker">{label}</p>
			<span class="bp-meta">{lineCount} lines</span>
			<span class="bp-meta">{charCount} chars</span>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			<div class="tabs tabs-boxed">
				<button class="tab" class:tab-active={mode === 'edit'} onclick={() => (mode = 'edit')}>Edit</button>
				<button class="tab" class:tab-active={mode === 'split'} onclick={() => (mode = 'split')}>Split</button>
				<button class="tab" class:tab-active={mode === 'preview'} onclick={() => (mode = 'preview')}>Preview</button>
			</div>
			<span class="bp-pill">
				{saveState === 'saving' ? 'Saving' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Error' : 'Clean'}
			</span>
		</div>
	</div>

	<div class={`bp-editor-grid ${mode === 'split' ? 'is-split' : ''}`}>
		{#if mode !== 'preview'}
			<div class="bp-editor-pane">
				<textarea
					bind:this={textarea}
					class="bp-editor-textarea"
					bind:value={draft}
					oninput={scheduleSave}
					onkeydown={handleKeydown}
					onblur={() => void save()}
					spellcheck="false"
				></textarea>
			</div>
		{/if}

		{#if mode !== 'edit'}
			<div class="bp-editor-pane prose prose-invert bp-editor-preview">
				{@html renderedHtml}
			</div>
		{/if}
	</div>
</div>
