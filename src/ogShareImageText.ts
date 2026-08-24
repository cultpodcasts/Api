/**
 * ASCII hyphen-minus and three dots only. Punctuation outside Figtree’s
 * basic set can make Satori paint the whole title in Instrument Serif
 * (different face and optical size than a normal Figtree title).
 */
export const OG_TITLE_HYPHEN = "-";
export const OG_TITLE_ELLIPSIS = "...";

/** Wide-card episode titles always use this px so hyphenated and wrapped titles match. */
export const OG_WIDE_TITLE_PX = 72;

/** Square-card title: wide 72px scaled by canvas width (800/1200). */
export const OG_SQUARE_TITLE_PX = 48;

/**
 * Same Figtree width as titles. A tighter factor (0.42) filled the leftover
 * column but painted over the stacked meta.
 */
export const OG_SHOW_NAME_CHAR_WIDTH_FACTOR = 0.56;

/** Longest whitespace-separated token length (URLs / compounds drive overflow risk). */
export function longestTokenLength(text: string): number {
	const tokens = text.trim().split(/\s+/).filter(Boolean);
	if (tokens.length === 0) {
		return 0;
	}
	return Math.max(...tokens.map((t) => t.length));
}

/**
 * Wrap a title into at most maxLines. Tokens wider than the column are split
 * with a trailing hyphen (no dictionary); leftover copy on the last line gets `…`.
 */
export function layoutOgTitle(opts: {
	text: string;
	columnWidth: number;
	fontSize: number;
	maxLines: number;
	charWidthFactor?: number;
	hyphenCharWidthFactor?: number;
}): { lines: string[] } {
	const words = opts.text.trim().split(/\s+/).filter(Boolean);
	if (words.length === 0) {
		return { lines: [""] };
	}
	const glyph = opts.fontSize * (opts.charWidthFactor ?? 0.56);
	/** Slightly tighter than wrap 0.56 so hyphenated lines fill the Figtree column. */
	const hyphenGlyph = opts.fontSize * (opts.hyphenCharWidthFactor ?? 0.5);
	const space = opts.fontSize * 0.22;
	const maxW = opts.columnWidth;
	const maxLines = Math.max(1, opts.maxLines);
	const lines: string[] = [];
	let current = "";
	let currentW = 0;
	let overflow = false;

	const flush = (): void => {
		if (current) {
			lines.push(current);
			current = "";
			currentW = 0;
		}
	};

	const roomChars = (): number => {
		const roomPx = current ? maxW - currentW - space : maxW;
		return Math.max(0, Math.floor(roomPx / glyph));
	};

	const append = (token: string): void => {
		const tokenW = token.length * glyph;
		if (current && currentW + space + tokenW > maxW) {
			flush();
		}
		if (current) {
			current = `${current} ${token}`;
			currentW += space + tokenW;
		} else {
			current = token;
			currentW = tokenW;
		}
	};

	const hyphenRoomChars = (): number => {
		const roomPx = current ? maxW - currentW - space : maxW;
		return Math.max(0, Math.floor(roomPx / hyphenGlyph));
	};

	const appendHyphenated = (word: string): void => {
		let rest = word;
		while (rest.length > 0) {
			if (lines.length >= maxLines) {
				overflow = true;
				return;
			}
			if (hyphenRoomChars() < 2 && current) {
				flush();
				continue;
			}
			const room = hyphenRoomChars();
			if (rest.length <= room) {
				append(rest);
				return;
			}
			const take = Math.max(1, room - 1);
			append(`${rest.slice(0, take)}${OG_TITLE_HYPHEN}`);
			flush();
			rest = rest.slice(take);
		}
	};

	for (const word of words) {
		if (lines.length >= maxLines) {
			overflow = true;
			break;
		}
		if (word.length * glyph <= maxW) {
			if (current && currentW + space + word.length * glyph > maxW) {
				flush();
				if (lines.length >= maxLines) {
					overflow = true;
					break;
				}
			}
			append(word);
		} else {
			appendHyphenated(word);
		}
	}
	flush();

	if (lines.length > maxLines) {
		lines.length = maxLines;
		overflow = true;
	}

	if (overflow && lines.length > 0) {
		let last = lines[lines.length - 1];
		if (last.endsWith(OG_TITLE_HYPHEN)) {
			last = last.slice(0, -OG_TITLE_HYPHEN.length);
		}
		const maxChars = Math.max(2, Math.floor(maxW / glyph));
		if (last.length + OG_TITLE_ELLIPSIS.length > maxChars) {
			last = last.slice(0, Math.max(1, maxChars - OG_TITLE_ELLIPSIS.length));
		}
		if (!last.endsWith(OG_TITLE_ELLIPSIS)) {
			lines[lines.length - 1] = `${last}${OG_TITLE_ELLIPSIS}`;
		}
	}

	return { lines: lines.length > 0 ? lines : [""] };
}

/**
 * Greedy word-wrap line count for Figtree Semibold titles.
 * Long tokens count as every hyphenated line they occupy.
 */
export function countOgWrappedLines(opts: {
	text: string;
	columnWidth: number;
	fontSize: number;
	maxLines: number;
	charWidthFactor?: number;
}): number {
	return Math.max(1, layoutOgTitle(opts).lines.length);
}

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
/**
 * Wide show-name rule applied to a column: keep 48px if two lines fit,
 * then step down sizes, then ellipsis. Used for square leftover width.
 */
export function layoutOgShowName(opts: {
	text: string;
	columnWidth: number;
	sizes: readonly number[];
	maxLines: number;
}): { lines: string[]; fontSize: number } {
	const sizes = opts.sizes.length > 0 ? opts.sizes : [48];
	let last = { lines: [""], fontSize: sizes[sizes.length - 1] ?? 48 };
	for (const fontSize of sizes) {
		const laid = layoutOgTitle({
			text: opts.text,
			columnWidth: opts.columnWidth,
			fontSize,
			maxLines: opts.maxLines,
			charWidthFactor: OG_SHOW_NAME_CHAR_WIDTH_FACTOR,
			hyphenCharWidthFactor: 0.5
		});
		last = { lines: laid.lines, fontSize };
		const clipped = laid.lines.some((line) => line.endsWith(OG_TITLE_ELLIPSIS));
		if (!clipped) {
			return last;
		}
	}
	return last;
}

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
