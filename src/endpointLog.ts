import { searchLogQueryRequest } from "./searchLogQueryRequest";

export type EndpointLogOutcome =
	| "success"
	| "error"
	| "unauthorised"
	| "forbidden"
	| "not_found"
	| "passthrough"
	| "aborted";

export interface endpointLog {
	/** Stable machine-readable event id for Workers Logs filters (e.g. people.r2_hit). */
	event?: string;
	/** Coarse request outcome for dashboard filters. */
	outcome?: EndpointLogOutcome;
	/** Handler / proxy name (e.g. getPeople, createPerson). */
	route?: string;
	message?: string;
	messages?: string[];
	status?: number;
	request: searchLogQueryRequest;
}
