/**
 * A request the client got wrong: bad OData filter, unsupported facet, malformed body.
 * The docs/search route returns these as 400 with an Azure-like `{ error: { code, message } }`.
 * Anything else thrown while serving a search (D1 errors, overload, timeouts) is a 503:
 * retryable and never the client's fault (SP-1.9, cultpodcasts/Api#269; SP-1.5 forwards it).
 */
export class SearchRequestError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "SearchRequestError";
	}
}
