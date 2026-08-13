import { ISearchResult } from "./ISearchResult";
import { searchLogQueryDetails } from "./searchLogQueryDetails";
import { searchLogQueryErrors } from "./searchLogQueryErrors";
import { searchLogQueryRequest } from "./searchLogQueryRequest";

/**
 * Search-specific structured log. Keeps query/results/errors shape (not the
 * generic endpoint `event`/`outcome` model) but follows LogCollector emit
 * conventions: one terminal write, string `message` for Workers Logs Message.
 */
export interface searchLog {
	/**
	 * Primary Workers Logs Message column text. Always set on emit so the
	 * dashboard is not blank when logging a structured object.
	 */
	message: string;
	/** CF-Ray / request id for correlating with Invocations grouping. */
	requestId?: string;
	/** Step breadcrumbs accumulated during the request (no mid-request console). */
	messages?: string[];
	errors?: searchLogQueryErrors;
	query?: searchLogQueryDetails;
	searchResult?: ISearchResult;
	results?: number | undefined | null;
	request: searchLogQueryRequest;
}
