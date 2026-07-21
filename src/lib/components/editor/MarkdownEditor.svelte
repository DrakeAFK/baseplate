<script lang="ts">
	import { onDestroy, onMount, tick, untrack } from 'svelte';

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
	let saveState: 'idle' | 'saving' | 'saved' | 'error' | 'conflict' = $state('idle');
	let diskVersion = $state<{ body: string; html: string } | null>(null);
	let timer: ReturnType<typeof setTimeout> | null = null;
	let queuedSave = $state(false);
	let textarea = $state<HTMLTextAreaElement | null>(null);
	let savedResetTimer: ReturnType<typeof setTimeout> | null = null;
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

	async function syncTextarea(value: string, snapshot: SelectionSnapshot = null): Promise<void> {
		await tick();
		if (!textarea || textarea.value === value) return;
		textarea.value = value;
		await restoreSelection(snapshot);
	}

	$effect(() => {
		if (value !== lastSeenValue) {
			const hasLocalEdits = draft !== lastSavedValue;
			const selection = captureSelection();
			lastSeenValue = value;
			lastSavedValue = value;
			if (!hasLocalEdits) {
				draft = value;
				void syncTextarea(value, selection);
			}
		}
		renderedHtml = previewHtml;
	});

	function scheduleSave(): void {
		if (timer) clearTimeout(timer);
		if (saveState !== 'saving') saveState = 'idle';
		timer = setTimeout(() => void save(), 450);
	}

	function updateDraftFromEditor(): void {
		if (!textarea) return;
		draft = textarea.value;
		scheduleSave();
	}

	function replaceSelection(replacement: string, nextSelectionOffset = replacement.length): void {
		if (!textarea) return;
		const start = textarea.selectionStart;
		const end = textarea.selectionEnd;
		textarea.setRangeText(replacement, start, end, 'end');
		const nextCursor = start + nextSelectionOffset;
		textarea.setSelectionRange(nextCursor, nextCursor);
		updateDraftFromEditor();
	}

	function indentSelection(outdent: boolean): void {
		if (!textarea) return;
		const selectionStart = textarea.selectionStart;
		const selectionEnd = textarea.selectionEnd;
		if (selectionStart === selectionEnd && !outdent) {
			replaceSelection('\t');
			return;
		}
		if (selectionStart === selectionEnd && outdent) {
			const lineStart = textarea.value.lastIndexOf('\n', selectionStart - 1) + 1;
			const prefix = textarea.value.slice(lineStart).match(/^(\t| {1,2})/)?.[0] ?? '';
			if (!prefix) return;
			textarea.setRangeText('', lineStart, lineStart + prefix.length, 'preserve');
			updateDraftFromEditor();
			return;
		}

		const blockStart = textarea.value.lastIndexOf('\n', selectionStart - 1) + 1;
		const nextBreak = textarea.value.indexOf('\n', selectionEnd);
		const blockEnd = nextBreak < 0 ? textarea.value.length : nextBreak;
		const selectedBlock = textarea.value.slice(blockStart, blockEnd);
		const nextBlock = outdent
			? selectedBlock.replace(/^(\t| {1,2})/gm, '')
			: selectedBlock.replace(/^/gm, '\t');
		textarea.setSelectionRange(blockStart, blockEnd);
		textarea.setRangeText(nextBlock, blockStart, blockEnd, 'select');
		updateDraftFromEditor();
	}

	function handleKeydown(event: KeyboardEvent): void {
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
			event.preventDefault();
			void save();
			return;
		}

		if (event.key === 'Tab') {
			event.preventDefault();
			indentSelection(event.shiftKey);
			return;
		}

		if (event.key === 'Enter' && textarea && textarea.selectionStart === textarea.selectionEnd) {
			const cursor = textarea.selectionStart;
			const lineStart = textarea.value.lastIndexOf('\n', cursor - 1) + 1;
			const line = textarea.value.slice(lineStart, cursor);
			const match = line.match(/^(\s*)([-*+]|\d+\.)\s+(\[[ xX]\]\s+)?(.*)$/);
			if (!match) return;
			event.preventDefault();
			if (!match[4].trim()) {
				textarea.setSelectionRange(lineStart, cursor);
				replaceSelection('');
				return;
			}
			const nextMarker = /^\d+\.$/.test(match[2]) ? `${Number.parseInt(match[2], 10) + 1}.` : match[2];
			const checkbox = match[3] ? '[ ] ' : '';
			replaceSelection(`\n${match[1]}${nextMarker} ${checkbox}`);
		}
	}

	function setMode(nextMode: 'edit' | 'preview' | 'split'): void {
		mode = nextMode;
		localStorage.setItem('baseplate:editor-mode', nextMode);
		if (nextMode !== 'preview') void syncTextarea(draft);
	}

	async function save(force = false): Promise<void> {
		if (saveState === 'saving') {
			queuedSave = true;
			return;
		}

		if (draft === lastSavedValue && !force) return;

		saveState = 'saving';
		queuedSave = false;
		const snapshot = draft;

		try {
			const response = await fetch(saveUrl, {
				method,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ body: snapshot, baseBody: lastSavedValue, force })
			});
			const payload = await response.json().catch(() => null);
			if (!response.ok) {
				if (response.status === 409 && payload?.document?.body !== undefined) {
					diskVersion = { body: payload.document.body, html: payload.document.html ?? '' };
					saveState = 'conflict';
					return;
				}
				saveState = 'error';
				return;
			}

			const nextValue = payload?.document?.body ?? snapshot;
			const changedDuringSave = draft !== snapshot;
			lastSavedValue = nextValue;
			lastSeenValue = nextValue;
			if (!changedDuringSave) {
				draft = nextValue;
				// The textarea is intentionally uncontrolled while typing. Avoiding a DOM value
				// assignment here keeps the caret and scroll anchor perfectly stable on autosave.
			}
			renderedHtml = payload?.document?.html ?? renderedHtml;
			onSaved(payload);
			saveState = 'saved';
			if (savedResetTimer) clearTimeout(savedResetTimer);
			savedResetTimer = setTimeout(() => {
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

	function useDiskVersion(): void {
		if (!diskVersion) return;
		draft = diskVersion.body;
		lastSavedValue = diskVersion.body;
		lastSeenValue = diskVersion.body;
		renderedHtml = diskVersion.html;
		void syncTextarea(diskVersion.body);
		diskVersion = null;
		saveState = 'idle';
	}

	onMount(() => {
		if (textarea) textarea.value = draft;
		const preferredMode = localStorage.getItem('baseplate:editor-mode');
		if (preferredMode === 'edit' || preferredMode === 'preview' || preferredMode === 'split') mode = preferredMode;
	});

	onDestroy(() => {
		if (timer) clearTimeout(timer);
		if (savedResetTimer) clearTimeout(savedResetTimer);
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
				<button class="tab" class:tab-active={mode === 'edit'} onclick={() => setMode('edit')}>Edit</button>
				<button class="tab" class:tab-active={mode === 'split'} onclick={() => setMode('split')}>Split</button>
				<button class="tab" class:tab-active={mode === 'preview'} onclick={() => setMode('preview')}>Preview</button>
			</div>
			<span class="bp-save-state" class:is-saving={saveState === 'saving'} class:is-error={saveState === 'error' || saveState === 'conflict'} aria-live="polite">
				<span class="bp-save-dot"></span>
				{saveState === 'saving' ? 'Saving' : saveState === 'saved' ? 'Saved' : saveState === 'conflict' ? 'Disk conflict' : saveState === 'error' ? 'Save failed' : draft === lastSavedValue ? 'Saved' : 'Unsaved'}
			</span>
			{#if saveState === 'conflict'}
				<button class="btn btn-xs btn-ghost" onclick={useDiskVersion}>Use disk</button>
				<button class="btn btn-xs btn-primary" onclick={() => void save(true)}>Keep mine</button>
			{/if}
		</div>
	</div>

	<div class={`bp-editor-grid ${mode === 'split' ? 'is-split' : ''}`}>
		{#if mode !== 'preview'}
			<div class="bp-editor-pane">
				<textarea
					bind:this={textarea}
					class="bp-editor-textarea"
					oninput={updateDraftFromEditor}
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
