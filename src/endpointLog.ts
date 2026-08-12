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
	/**
	 * Primary Workers Logs Message column text. Always set on emit so the
	 * dashboard is not blank when logging a structured object.
	 */
	message: string;
	/** Stable machine-readable event id for Workers Logs filters (e.g. people.r2_hit). */
	event?: string;
	/** Coarse request outcome for dashboard filters. */
	outcome?: EndpointLogOutcome;
	/** Handler / proxy name (e.g. getPeople, createPerson). */
	route?: string;
	/** CF-Ray / request id for correlating with Invocations grouping. */
	requestId?: string;
	messages?: string[];
	status?: number;
	request: searchLogQueryRequest;
}
