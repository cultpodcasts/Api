import { READ_SESSION_CONSTRAINT, SearchWorkerEngine, SearchWorkerRoute } from "./d1-session";
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

export enum SearchWorkerErrorClass {
	BadRequest = "bad_request",
	MethodNotAllowed = "method_not_allowed",
	NotFound = "not_found",
	D1Overloaded = "d1_overloaded",
	D1Error = "d1_error"
}

export type SearchWorkerErrorContext = {
	requestId?: string;
	route?: SearchWorkerRoute;
	sessionConstraint?: D1SessionConstraint;
	durationMs?: number;
	attempts?: number;
	retryCount?: number;
};

/** Same cap as the api Worker's upstream error logging (UPSTREAM_ERROR_LOG_LIMIT, #268). */
const ERROR_LOG_LIMIT = 500;

export const SERVICE_UNAVAILABLE = {
	error: { code: "ServiceUnavailable", message: "Search is temporarily unavailable." }
} as const;

export function classifyD1Error(message: string): SearchWorkerErrorClass {
	if (/overloaded|too many resources consumed|too many requests queued/i.test(message)) {
		return SearchWorkerErrorClass.D1Overloaded;
	}
	return SearchWorkerErrorClass.D1Error;
}

/** 400 in Azure's own envelope: `code` empty, the reason in `message`. */
export function badRequest(e: unknown, context: SearchWorkerErrorContext = {}): Response {
	const errorMessage = (e instanceof Error ? e.message : "bad request").slice(0, ERROR_LOG_LIMIT);
	console.warn("search: bad request", {
		requestId: context.requestId,
		route: context.route ?? SearchWorkerRoute.DocsSearch,
		engine: SearchWorkerEngine.D1,
		status: 400,
		sessionConstraint: context.sessionConstraint ?? READ_SESSION_CONSTRAINT,
		errorClass: SearchWorkerErrorClass.BadRequest,
		errorMessage,
		durationMs: context.durationMs
	});
	return json({ error: { code: "", message: errorMessage } }, 400);
}

/**
 * D1 runtime failure (overload, timeout, reset, missing schema): 503 with a fixed body, retryable
 * and never a 4xx. The detail (SQL, schema names) goes to Workers logs only, because the api Worker
 * forwards an upstream JSON error body to its caller (SP-1.5).
 */
export function d1Unavailable(e: unknown, context: SearchWorkerErrorContext = {}): Response {
	const message = (e instanceof Error ? e.message : String(e)).slice(0, ERROR_LOG_LIMIT);
	const name = e instanceof Error ? e.name : typeof e;
	const errorClass = classifyD1Error(message);
	console.error("search: D1 failure", {
		message,
		name,
		requestId: context.requestId,
		route: context.route ?? SearchWorkerRoute.DocsSearch,
		engine: SearchWorkerEngine.D1,
		status: 503,
		upstreamStatus: 503,
		sessionConstraint: context.sessionConstraint ?? READ_SESSION_CONSTRAINT,
		servedByRegion: null,
		errorClass,
		errorMessage: message,
		attempts: context.attempts ?? 1,
		retryCount: context.retryCount ?? 0,
		durationMs: context.durationMs
	});
	return json(SERVICE_UNAVAILABLE, 503);
}

export function workerErrorResponse(
	status: 404 | 405,
	code: string,
	message: string,
	errorClass: SearchWorkerErrorClass,
	context: SearchWorkerErrorContext = {}
): Response {
	console.warn("search: request rejected", {
		requestId: context.requestId,
		route: context.route ?? SearchWorkerRoute.Unknown,
		engine: SearchWorkerEngine.D1,
		status,
		errorClass,
		errorMessage: message,
		durationMs: context.durationMs
	});
	return json({ error: { code, message } }, status);
}