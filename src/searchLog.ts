import { searchLogQueryDetails } from "./searchLogQueryDetails";
import { searchLogQueryErrors } from "./searchLogQueryErrors";
import { searchLogQueryRequest } from "./searchLogQueryRequest";

export interface searchLog {
    query?: searchLogQueryDetails;
    errors?: searchLogQueryErrors;
    searchStatus?: number;
    request: searchLogQueryRequest;
}
