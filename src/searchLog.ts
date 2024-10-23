import { searchLogQueryDetails } from "./searchLogQueryDetails";
import { searchLogQueryErrors } from "./searchLogQueryErrors";
import { searchLogQueryRequest } from "./searchLogQueryRequest";

export interface searchLog {
    errors?: searchLogQueryErrors;
    query?: searchLogQueryDetails;
    request: searchLogQueryRequest;
}
