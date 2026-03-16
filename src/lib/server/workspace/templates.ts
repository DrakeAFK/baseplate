import type { NoteKind } from '$lib/types/models';

export function defaultTemplate(kind: NoteKind, title: string): string {
	if (kind === 'meeting') {
		return `# ${title}\n\n## Context\n\n## Notes\n\n## Decisions\n\n## Follow-ups\n- [ ] `;
	}

	if (kind === 'decision') {
		return `# ${title}\n\n## Context\n\n## Decision\n\n## Consequences\n`;
	}

	if (kind === 'daily') {
		return `# ${title}\n\n## Focus\n\n## Notes\n`;
	}

	if (kind === 'project_home') {
		return `# ${title}\n\n## Overview\n\n## Current Status\n\n## Notes\n`;
	}

	return `# ${title}\n\n## Notes\n`;
}
