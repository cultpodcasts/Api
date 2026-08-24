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

/**
 * Shrink type through `sizes` (largest first) so `text` fits in maxLines.
 * Truncate only after the smallest size still overflows.
 */
export function fitOgWrappedText(opts: {
	text: string;
	columnWidth: number;
	sizes: readonly number[];
	maxLines: number;
}): { text: string; fontSize: number } {
	const raw = opts.text.trim();
	const sizes = opts.sizes.length > 0 ? opts.sizes : [16];
	let lastBudget = 16;
	for (const fontSize of sizes) {
		const budget = ogTitleCharBudget({
			columnWidth: opts.columnWidth,
			fontSize,
			maxLines: opts.maxLines
		});
		lastBudget = budget;
		if (raw.length <= budget) {
			return { text: raw, fontSize };
		}
	}
	return {
		text: truncateOgText(raw, lastBudget),
		fontSize: sizes[sizes.length - 1] ?? 16
	};
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
