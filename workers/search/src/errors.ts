import { json } from "./health";

/**
 * A request the client got wrong: bad OData filter, unsupported facet, malformed body.
 * The docs/search and admin routes return these as 400 with an Azure-like `{ error: { code, message } }`.
 * Anything else thrown while serving a request (D1 errors, overload, timeouts) is a 503:
 * retryable and never the client's fault (SP-1.9, cultpodcasts/Api#269; SP-1.5 forwards it).
 */
export class SearchRequestError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "SearchRequestError";
	}
}

/** Same cap as the api Worker's upstream error logging (UPSTREAM_ERROR_LOG_LIMIT, #268). */
const ERROR_LOG_LIMIT = 500;

export const SERVICE_UNAVAILABLE = {
	error: { code: "ServiceUnavailable", message: "Search is temporarily unavailable." }
} as const;

/** 400 in Azure's own envelope: `code` empty, the reason in `message`. */
export function badRequest(e: unknown): Response {
	return json({ error: { code: "", message: e instanceof Error ? e.message : "bad request" } }, 400);
}

/**
 * D1 runtime failure (overload, timeout, reset, missing schema): 503 with a fixed body, retryable
 * and never a 4xx. The detail (SQL, schema names) goes to Workers logs only, because the api Worker
 * forwards an upstream JSON error body to its caller (SP-1.5).
 */
export function d1Unavailable(e: unknown): Response {
	const message = (e instanceof Error ? e.message : String(e)).slice(0, ERROR_LOG_LIMIT);
	console.error("search: D1 failure", { message, name: e instanceof Error ? e.name : typeof e });
	return json(SERVICE_UNAVAILABLE, 503);
}
