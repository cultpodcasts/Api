import { ActionContext } from "./ActionContext";
import { ISearchResult } from "./ISearchResult";
import { oDataSearchModel } from "./oDataSearchModel";
import { SearchEngine, SearchErrorClass, SearchRoute } from "./searchEngine";
import { searchLog } from "./searchLog";
import { searchMode } from "./searchMode";
import { searchOperation } from "./searchOperation";

export enum SearchLogLevel {
	Info = "info",
	Warn = "warn",
	Error = "error"
}

/** Optional fields applied on terminal emit (search stays query/results-shaped). */
export type SearchLogEmitProps = Partial<searchOperation> & { message?: string };

/**
 * Extracts a single-quoted OData string value immediately following `prefix`,
 * unescaping doubled single quotes (`''` -> `'`).
 */
export function extractODataSingleQuotedValue(filter: string, prefix: string): string | undefined {
	if (!filter.startsWith(prefix)) return undefined;
	let out = "";
	for (let i = prefix.length; i < filter.length; i++) {
		const c = filter[i];
		if (c === "'") {
			if (filter[i + 1] === "'") {
				out += "'";
				i++;
				continue;
			}
			return out;
		}
		out += c;
	}
	return undefined;
}

/**
 * Search-specific per-request log accumulator. Same emit conventions as
 * {@link LogCollector} (one terminal console write; `message` for Workers Logs;
 * `console.info` / `warn` / `error` by level) but keeps search payload fields
 * (query, results, mode, errors) instead of generic event/outcome.
 *
 * Intermediate {@link add} / {@link addMessage} never touch `console.*`.
 */
export class searchLogCollector implements searchOperation {
	private flushed = false;
	private flushedPayload?: searchLog;

	collectRequest(c: ActionContext) {
		this.route = SearchRoute.Search;
		const cfRay = c.req.header("cf-ray");
		if (cfRay) {
			this.requestId = cfRay;
		}
		if (c.req.raw.cf != undefined && c.req.raw.cf) {
			this.add({
				clientTrustScoretr: c.req.raw.cf.clientTrustScoretr as string,
				asn: c.req.raw.cf.asn as string,
				ipAddress: c.req.header("cf-connecting-ip") as string,
				userAgent: c.req.header("User-Agent") as string
			});
			if (c.req.raw.cf.city) {
				this.add({ city: c.req.raw.cf.city as string });
			}
			if (c.req.raw.cf.country) {
				this.add({ country: c.req.raw.cf.country as string });
			}
			if (c.req.raw.cf.verifiedBotCategory) {
				this.add({ verifiedBotCategory: c.req.raw.cf.verifiedBotCategory as string });
			}
			if (c.req.raw.cf.asOrganization) {
				this.add({ asOrganization: c.req.raw.cf.asOrganization as string });
			}
		}
	}

	collectSearchRequest(data: oDataSearchModel) {
		if (data.search) {
			this.add({ query: data.search, mode: searchMode.search });
		}
		if (data.filter) {
			let filter: string = data.filter;
			if (filter.indexOf("(podcastName eq '") == 0) {
				const idFilter = "') and (id eq ";
				if (filter.indexOf(idFilter) >= 0) {
					const filterCutoff = filter.indexOf(idFilter);
					const episodeId = filter.slice(filterCutoff + idFilter.length + 1, -2);
					this.add({ mode: searchMode.episode, episodeId: episodeId, filter: filter });
				} else {
					const podcastName = extractODataSingleQuotedValue(filter, "(podcastName eq '") ?? filter.slice(17, -2);
					this.add({ podcastName, mode: searchMode.podcast, filter: filter });
				}
			} else if (filter.indexOf("subjects/any(s: s eq '") == 0) {
				const subject = extractODataSingleQuotedValue(filter, "subjects/any(s: s eq '") ?? filter.slice(22, -2);
				this.add({ subject, mode: searchMode.subject });
			} else if (filter.indexOf("(id eq '") == 0) {
				const episodeId = extractODataSingleQuotedValue(filter, "(id eq '") ?? filter.slice(8, -2);
				this.add({ episodeId, mode: searchMode.shortnerFallback, filter: filter });
			} else if (
				filter.indexOf("search.in(podcastName, '") == 0 ||
				filter.indexOf("subjects/any(s: search.in(s, '") == 0
			) {
				// valid
			} else {
				this.add({ unrecognisedSearchFilter: true, filter: filter });
			}
		}
		if (!data.search && !data.filter) {
			this.add({ unrecognisedSearchFilter: true, missingSearch: true });
		}
		if (data.skip) {
			this.add({ skip: parseInt(data.skip) });
		}
		if (data.orderby && data.orderby != "") {
			this.add({ orderBy: data.orderby });
		}
	}

	/** Append a step for transaction tracing (no console write). */
	addMessage(message: string) {
		if (!this.messages) {
			this.messages = [];
		}
		this.messages.push(message);
	}

	add(props: SearchLogEmitProps): void {
		if (props.hasOwnProperty("requestId")) {
			this.requestId = props.requestId;
		}
		if (props.hasOwnProperty("leech")) {
			this.leech = props.leech;
			this.error = true;
		}
		if (props.hasOwnProperty("searchStatus")) {
			this.searchStatus = props.searchStatus;
			if (this.searchStatus != 200) {
				this.error = true;
			}
		}
		if (props.hasOwnProperty("upstreamStatus")) {
			this.upstreamStatus = props.upstreamStatus;
		}
		if (props.hasOwnProperty("errorClass")) {
			this.errorClass = props.errorClass;
			if (props.errorClass !== undefined) {
				this.error = true;
			}
		}
		if (props.hasOwnProperty("errorMessage")) {
			this.errorMessage = props.errorMessage;
			if (props.errorMessage !== undefined) {
				this.error = true;
			}
		}
		if (props.hasOwnProperty("route")) {
			this.route = props.route;
		}
		if (props.hasOwnProperty("engine")) {
			this.engine = props.engine;
		}
		if (props.hasOwnProperty("servedByRegion")) {
			this.servedByRegion = props.servedByRegion;
		}
		if (props.hasOwnProperty("sessionConstraint")) {
			this.sessionConstraint = props.sessionConstraint;
		}
		if (props.hasOwnProperty("attempts")) {
			this.attempts = props.attempts;
		}
		if (props.hasOwnProperty("retryCount")) {
			this.retryCount = props.retryCount;
		}
		if (props.hasOwnProperty("durationMs")) {
			this.durationMs = props.durationMs;
		}
		if (props.hasOwnProperty("orderBy")) {
			this.orderBy = props.orderBy;
		}
		if (props.hasOwnProperty("skip")) {
			this.skip = props.skip;
		}
		if (props.hasOwnProperty("subject")) {
			this.subject = props.subject;
		}
		if (props.hasOwnProperty("podcastName")) {
			this.podcastName = props.podcastName;
		}
		if (props.hasOwnProperty("episodeId")) {
			this.episodeId = props.episodeId;
		}
		if (props.hasOwnProperty("mode")) {
			if (this.mode != null && props.mode != null && this.mode !== props.mode) {
				this.addMessage(searchMode[this.mode] ?? String(this.mode));
			}
			this.mode = props.mode;
		}
		if (props.hasOwnProperty("country")) {
			this.country = props.country;
		}
		if (props.hasOwnProperty("city")) {
			this.city = props.city;
		}
		if (props.hasOwnProperty("userAgent")) {
			this.userAgent = props.userAgent;
		}
		if (props.hasOwnProperty("clientTrustScoretr")) {
			this.clientTrustScoretr = props.clientTrustScoretr;
		}
		if (props.hasOwnProperty("asn")) {
			this.asn = props.asn;
		}
		if (props.hasOwnProperty("ipAddress")) {
			this.ipAddress = props.ipAddress;
		}
		if (props.hasOwnProperty("query")) {
			this.query = props.query;
		}
		if (props.hasOwnProperty("unrecognisedSearchFilter")) {
			this.unrecognisedSearchFilter = props.unrecognisedSearchFilter;
			this.error = true;
		}
		if (props.hasOwnProperty("filter")) {
			this.filter = props.filter;
		}
		if (props.hasOwnProperty("missingSearch")) {
			this.missingSearch = props.missingSearch;
			this.error = true;
		}
		if (props.hasOwnProperty("verifiedBotCategory")) {
			this.verifiedBotCategory = props.verifiedBotCategory;
		}
		if (props.hasOwnProperty("asOrganization")) {
			this.asOrganization = props.asOrganization;
		}
		if (props.hasOwnProperty("searchResult")) {
			this.searchResult = {
				podcastName: props.searchResult!.podcastName,
				episodeTitle: props.searchResult!.episodeTitle
			};
		}
		if (props.hasOwnProperty("results")) {
			this.results = props.results;
		}
		if (props.hasOwnProperty("message")) {
			this.message = props.message;
		}
		if (props.hasOwnProperty("engine")) {
			this.engine = props.engine;
		}
		if (props.hasOwnProperty("attempts")) {
			this.attempts = props.attempts;
		}
	}

	/**
	 * Workers Logs Message column comes from the logged object's `message`
	 * string. Object-only console writes leave that column blank.
	 */
	primaryMessage(): string {
		if (this.message && this.message.trim().length > 0) {
			return this.message;
		}
		const parts: string[] = ["search"];
		if (this.mode != null && Number(this.mode) >= 0) {
			parts.push(searchMode[this.mode]);
		}
		if (this.query) {
			parts.push(this.query);
		} else if (this.podcastName) {
			parts.push(this.podcastName);
		} else if (this.subject) {
			parts.push(this.subject);
		} else if (this.episodeId) {
			parts.push(this.episodeId);
		}
		if (this.leech) {
			parts.push("leech");
		} else if (this.missingSearch) {
			parts.push("missing_search");
		} else if (this.unrecognisedSearchFilter) {
			parts.push("unrecognised_filter");
		} else if (this.error) {
			parts.push("error");
		} else if (this.results != null) {
			parts.push(`${this.results}`);
		}
		return parts.join(" ");
	}

	toSearchLog(): searchLog {
		const searchLog: searchLog = {
			message: this.primaryMessage(),
			query: {
				orderBy: this.orderBy,
				skip: this.skip,
				episodeId: this.episodeId,
				mode: this.mode && Number(this.mode) >= 0 ? searchMode[this.mode] : undefined,
				podcastName: this.podcastName,
				subject: this.subject,
				query: this.query,
				filter: this.filter
			},
			request: {
				country: this.country,
				city: this.city,
				userAgent: this.userAgent,
				clientTrustScoretr: this.clientTrustScoretr,
				asn: this.asn,
				ipAddress: this.ipAddress,
				verifiedBotCategory: this.verifiedBotCategory,
				asOrganization: this.asOrganization
			}
		};
		if (this.requestId) {
			searchLog.requestId = this.requestId;
		}
		if (this.route) {
			searchLog.route = this.route;
		}
		if (this.engine) {
			searchLog.engine = this.engine;
		}
		if (this.servedByRegion !== undefined) {
			searchLog.servedByRegion = this.servedByRegion;
		}
		if (this.sessionConstraint) {
			searchLog.sessionConstraint = this.sessionConstraint;
		}
		if (this.upstreamStatus != null) {
			searchLog.upstreamStatus = this.upstreamStatus;
		}
		if (this.attempts != null) {
			searchLog.attempts = this.attempts;
		}
		if (this.retryCount != null) {
			searchLog.retryCount = this.retryCount;
		}
		if (this.durationMs != null) {
			searchLog.durationMs = this.durationMs;
		}
		if (this.messages && this.messages.length > 0) {
			searchLog.messages = this.messages;
		}
		if (this.searchResult) {
			searchLog.searchResult = this.searchResult;
		} else if (this.results != null) {
			searchLog.results = this.results;
		}
		if (this.engine) {
			searchLog.engine = this.engine;
		}
		if (this.attempts != null) {
			searchLog.attempts = this.attempts;
		}
		if (this.error) {
			searchLog.errors = {
				searchStatus: this.searchStatus,
				upstreamStatus: this.upstreamStatus,
				errorClass: this.errorClass,
				errorMessage: this.errorMessage,
				leech: this.leech,
				unrecognisedSearchFilter: this.unrecognisedSearchFilter,
				missingSearch: this.missingSearch
			};
		}
		return searchLog;
	}

	/**
	 * Terminal success/info write (`console.info`). Call once at end of request.
	 */
	emit(props?: SearchLogEmitProps): searchLog {
		return this.flush(SearchLogLevel.Info, props);
	}

	/** Terminal warning write (`console.warn`). Call once at end of request. */
	emitWarn(props?: SearchLogEmitProps): searchLog {
		return this.flush(SearchLogLevel.Warn, props);
	}

	/** Terminal error write (`console.error`). Call once at end of request. */
	emitError(props?: SearchLogEmitProps): searchLog {
		return this.flush(SearchLogLevel.Error, props);
	}

	hasFlushed(): boolean {
		return this.flushed;
	}

	private flush(level: SearchLogLevel, props?: SearchLogEmitProps): searchLog {
		if (this.flushed) {
			return this.flushedPayload ?? this.toSearchLog();
		}
		if (props) {
			this.add(props);
		}
		const payload = this.toSearchLog();
		this.flushed = true;
		this.flushedPayload = payload;
		if (level === SearchLogLevel.Error) {
			console.error(payload);
		} else if (level === SearchLogLevel.Warn) {
			console.warn(payload);
		} else {
			console.info(payload);
		}
		return payload;
	}

	error: boolean = false;
	leech?: boolean;
	searchStatus?: number;
	upstreamStatus?: number;
	errorClass?: SearchErrorClass;
	errorMessage?: string;
	route?: SearchRoute;
	engine?: SearchEngine;
	servedByRegion?: string | null;
	sessionConstraint?: string;
	attempts?: number;
	retryCount?: number;
	durationMs?: number;
	orderBy?: string;
	skip?: number;
	subject?: string;
	podcastName?: string;
	episodeId?: string;
	mode?: searchMode;
	country?: string;
	city?: string;
	userAgent?: string;
	clientTrustScoretr?: string;
	asn?: string;
	ipAddress?: string;
	query?: string;
	unrecognisedSearchFilter?: boolean;
	filter?: string;
	missingSearch?: boolean;
	verifiedBotCategory?: string;
	asOrganization?: string;
	searchResult?: ISearchResult;
	results?: number | undefined | null;
	message?: string;
	requestId?: string;
	messages?: string[];
}