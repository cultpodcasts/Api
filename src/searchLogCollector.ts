import { ActionContext } from "./ActionContext";
import { ISearchResult } from "./ISearchResult";
import { oDataSearchModel } from "./oDataSearchModel";
import { searchLog } from "./searchLog";
import { searchMode } from "./searchMode";
import { searchOperation } from "./searchOperation";

export type SearchLogLevel = "info" | "warn" | "error";

/** Optional fields applied on terminal emit (search stays query/results-shaped). */
export type SearchLogEmitProps = Partial<searchOperation> & { message?: string };

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
				let filterCutoff = -2;
				let query = filter.slice(17, filterCutoff);
				if (filter.indexOf(idFilter) >= 0) {
					filterCutoff = filter.indexOf(idFilter);
					const episodeId = filter.slice(filterCutoff + idFilter.length + 1, -2);
					this.add({ mode: searchMode.episode, episodeId: episodeId, filter: filter });
				} else {
					this.add({ podcastName: query, mode: searchMode.podcast, filter: filter });
				}
			} else if (filter.indexOf("subjects/any(s: s eq '") == 0) {
				let query = filter.slice(22, -2);
				this.add({ subject: query, mode: searchMode.subject });
			} else if (filter.indexOf("(id eq '") == 0) {
				let query = filter.slice(8, -2);
				this.add({ episodeId: query, mode: searchMode.shortnerFallback, filter: filter });
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
		if (this.messages && this.messages.length > 0) {
			searchLog.messages = this.messages;
		}
		if (this.searchResult) {
			searchLog.searchResult = this.searchResult;
		} else if (this.results != null) {
			searchLog.results = this.results;
		}
		if (this.error) {
			searchLog.errors = {
				searchStatus: this.searchStatus,
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
		return this.flush("info", props);
	}

	/** Terminal warning write (`console.warn`). Call once at end of request. */
	emitWarn(props?: SearchLogEmitProps): searchLog {
		return this.flush("warn", props);
	}

	/** Terminal error write (`console.error`). Call once at end of request. */
	emitError(props?: SearchLogEmitProps): searchLog {
		return this.flush("error", props);
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
		if (level === "error") {
			console.error(payload);
		} else if (level === "warn") {
			console.warn(payload);
		} else {
			console.info(payload);
		}
		return payload;
	}

	error: boolean = false;
	leech?: boolean;
	searchStatus?: number;
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
