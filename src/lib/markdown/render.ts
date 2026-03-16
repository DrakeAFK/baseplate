import MarkdownIt from 'markdown-it';
import sanitizeHtml from 'sanitize-html';
import { extractWikiLinks } from './wikilinks';
import { resolveObjectHref, resolveObjectLabel } from '$lib/server/services/links';

const markdown = new MarkdownIt({
	html: false,
	linkify: true,
	breaks: false
});

export function renderMarkdown(content: string): string {
	let transformed = content;

	for (const link of extractWikiLinks(content)) {
		const href = resolveObjectHref(link.type, link.id);
		const label = resolveObjectLabel(link.type, link.id, link.label);
		const replacement = href ? `[${label}](${href})` : `\`${label}\``;
		transformed = transformed.replace(link.full, replacement);
	}

	return sanitizeHtml(markdown.render(transformed), {
		allowedTags: sanitizeHtml.defaults.allowedTags.concat(['h1', 'h2', 'h3', 'h4', 'img']),
		allowedAttributes: {
			a: ['href', 'target', 'rel'],
			code: ['class']
		}
	});
}
