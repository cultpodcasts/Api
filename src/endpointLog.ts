import { searchLogQueryRequest } from "./searchLogQueryRequest";

export interface endpointLog {
    message?: string;
    messages?: string[];
    status?: number;
    request: searchLogQueryRequest;
}
