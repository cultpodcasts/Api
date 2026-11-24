import type { SearchErrorClass } from "./searchEngine";

export interface searchLogQueryErrors {
    searchStatus?: number;
    upstreamStatus?: number;
    errorClass?: SearchErrorClass;
    errorMessage?: string;
    leech?: boolean;
    unrecognisedSearchFilter?: boolean;
    missingSearch?: boolean;
}