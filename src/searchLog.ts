import { ISearchResult } from "./ISearchResult";
import { searchLogQueryDetails } from "./searchLogQueryDetails";
import { searchLogQueryErrors } from "./searchLogQueryErrors";
import { searchLogQueryRequest } from "./searchLogQueryRequest";

export interface searchLog {
    errors?: searchLogQueryErrors;
    query?: searchLogQueryDetails;
    searchResult?: ISearchResult;
    results?: number | undefined | null;
    request: searchLogQueryRequest;
}
