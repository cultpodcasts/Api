/** Which search index served or should serve `POST /search` (`@search.engine` wire values). */
export enum SearchEngine {
	Azure = "azure",
	D1 = "d1"
}

/** Route identifiers for structured search logs. */
export enum SearchRoute {
	Search = "/search"
}

/** Classified failure causes for non-2xx search responses. */
export enum SearchErrorClass {
	BadRequest = "bad_request",
	UpstreamHttpError = "upstream_http_error",
	UpstreamFetchError = "upstream_fetch_error",
	UpstreamUnreadableBody = "upstream_unreadable_body",
	UpstreamInvalidBody = "upstream_invalid_body",
	UpstreamUnexpectedStatus = "upstream_unexpected_status",
	UnexpectedError = "unexpected_error"
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Extracts a concise error message from an upstream JSON error envelope, bounded to `limit`. */
export function extractSearchErrorMessage(body: unknown, limit: number): string | undefined {
	if (!isRecord(body) || !("error" in body)) return undefined;
	const err = body.error;
	if (typeof err === "string" && err.trim()) {
		return err.trim().slice(0, limit);
	}
	if (isRecord(err)) {
		const code = typeof err.code === "string" ? err.code.trim() : "";
		const message = typeof err.message === "string" ? err.message.trim() : "";
		const combined = [code, message].filter(Boolean).join(": ");
		if (combined) return combined.slice(0, limit);
	}
	return undefined;
}