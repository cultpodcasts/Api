import type { oDataSearchModel } from "./oDataSearchModel";

/**
 * RPP #1434: users should not need quotes for an exact title or alternative-title
 * match to rank first. An unquoted search for Father's House must rank Faderhuset
 * above term-only matches such as Potter's House, the same as searching
 * "Father's House". The website and other clients send queryType=simple and
 * searchMode=any, which otherwise ORs the terms and lets "House" titles win.
 *
 * Unquoted multi-word queries gain a boosted Lucene phrase clause for the whole
 * query, alongside the original terms so broader matches remain. Queries the
 * user already quoted, or that already use search operators, are left unchanged.
 */
export const UNQUOTED_PHRASE_BOOST = 10;

/** Lucene reserved characters that must be escaped outside a phrase. */
const LUCENE_RESERVED = /[+\-!(){}[\]^"~*?:\\/]/g;

/** Client fielded searches such as title:Faderhuset. Not a title colon like Going Clear: .... */
const SEARCH_FIELD_PREFIX =
	/\b(?:title|episodeTitle|alternativeTitles|description|episodeDescription|seriesName|podcastName|subjects|contentKind|publisherSearchTerms|episodeSearchTerms):/i;

export function boostUnquotedPhrase(search: string): string {
	const normalized = search.trim().replace(/\s+/g, " ");
	if (!shouldBoostUnquotedPhrase(normalized)) {
		return search;
	}
	const phrase = normalized.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
	const terms = normalized.replace(LUCENE_RESERVED, "\\$&");
	return `"${phrase}"^${UNQUOTED_PHRASE_BOOST} OR (${terms})`;
}

export function shouldBoostUnquotedPhrase(search: string): boolean {
	const trimmed = search.trim();
	if (!trimmed || !/\s/.test(trimmed)) {
		return false;
	}
	if (/["|^(){}[\]~*\\?]/.test(trimmed)) {
		return false;
	}
	if (/^[+-]/.test(trimmed) || /\s[+-]\S/.test(trimmed)) {
		return false;
	}
	if (/^(AND|OR|NOT)\s/.test(trimmed) || /\s(AND|OR|NOT)\s/.test(trimmed)) {
		return false;
	}
	if (SEARCH_FIELD_PREFIX.test(trimmed)) {
		return false;
	}
	return true;
}

export function boostUnquotedPhraseInSearchRequest(data: oDataSearchModel): void {
	if (typeof data.search !== "string") {
		return;
	}
	const boosted = boostUnquotedPhrase(data.search);
	if (boosted === data.search) {
		return;
	}
	data.search = boosted;
	data.queryType = "full";
}
