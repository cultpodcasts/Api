/** Longest whitespace-separated token length (URLs / compounds drive overflow risk). */
export function longestTokenLength(text: string): number {
	const tokens = text.trim().split(/\s+/).filter(Boolean);
	if (tokens.length === 0) {
		return 0;
	}
	return Math.max(...tokens.map((t) => t.length));
}

/**
 * Char budget so a hard-truncated title (with ellipsis) fits in maxLines.
 * Figtree Semibold average glyph width ≈ 0.52×fontSize; slack keeps `…` on the last line
 * when Satori wraps slightly tighter than the heuristic.
 */
export function ogTitleCharBudget(opts: {
	columnWidth: number;
	fontSize: number;
	maxLines: number;
	charWidthFactor?: number;
}): number {
	const factor = opts.charWidthFactor ?? 0.52;
	const perLine = Math.max(8, Math.floor(opts.columnWidth / (opts.fontSize * factor)));
	return Math.max(16, perLine * opts.maxLines - 4);
}

/** Hard cap for OG copy — prefers a word boundary so ellipsis does not split mid-token. */
export function truncateOgText(text: string, max: number): string {
	const t = text.trim();
	if (t.length <= max) {
		return t;
	}
	const slice = t.slice(0, max - 1);
	const lastSpace = slice.lastIndexOf(" ");
	const cut = lastSpace > max * 0.55 ? slice.slice(0, lastSpace) : slice.trimEnd();
	return `${cut}…`;
}
