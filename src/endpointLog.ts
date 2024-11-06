import { searchLogQueryRequest } from "./searchLogQueryRequest";

export interface endpointLog {
    message?: string;
    status?: number;
    request: searchLogQueryRequest;
}
