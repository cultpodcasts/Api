import { ActionContext } from "./ActionContext";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { endpointLog, EndpointLogOutcome } from "./endpointLog";
import { endpointOperation } from "./endpointOperation";

export type EndpointLogLevel = "log" | "warn" | "error";

/** Filterable fields for structured Workers Logs emits. */
export type StructuredLogProps = Pick<
	endpointOperation,
	"event" | "outcome" | "route" | "status" | "message"
>;

/**
 * Per-request log accumulator: gather CF metadata, route fields, and step
 * messages during the handler, then write **one** structured `endpointLog`
 * at the end via {@link emit} / {@link emitWarn} / {@link emitError}.
 *
 * Intermediate {@link add} / {@link addMessage} never touch `console.*`.
 * A second terminal emit is a no-op (keeps the first write) so abort handlers
 * cannot double-log after a successful finish.
 */
export class LogCollector implements endpointOperation {
	private flushed = false;
	private flushedPayload?: endpointLog;

	collectRequest(c: Auth0ActionContext | ActionContext) {
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

	/** Append a step for transaction tracing (no console write). */
	addMessage(message: string) {
		if (!this.messages) {
			this.messages = [];
		}
		this.messages.push(message);
	}

	/**
	 * Accumulate structured fields (no console write).
	 * Replacing `event` pushes the previous event id into {@link messages}
	 * so failed attempts remain visible in the final log.
	 */
	add(props: endpointOperation): void {
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
		if (props.hasOwnProperty("verifiedBotCategory")) {
			this.verifiedBotCategory = props.verifiedBotCategory;
		}
		if (props.hasOwnProperty("asOrganization")) {
			this.asOrganization = props.asOrganization;
		}
		if (props.hasOwnProperty("message")) {
			this.message = props.message;
		}
		if (props.hasOwnProperty("status")) {
			this.status = props.status;
		}
		if (props.hasOwnProperty("event")) {
			if (this.event && props.event && this.event !== props.event) {
				this.addMessage(this.event);
			}
			this.event = props.event;
		}
		if (props.hasOwnProperty("outcome")) {
			this.outcome = props.outcome;
		}
		if (props.hasOwnProperty("route")) {
			this.route = props.route;
		}
	}

	/**
	 * Workers Logs Message column comes from the logged object's `message`
	 * string. Object-only console.log leaves that column blank.
	 */
	primaryMessage(): string {
		if (this.message && this.message.trim().length > 0) {
			return this.message;
		}
		const parts: string[] = [];
		if (this.route) {
			parts.push(this.route);
		}
		if (this.event) {
			parts.push(this.event);
		}
		if (this.outcome) {
			parts.push(this.outcome);
		}
		return parts.length > 0 ? parts.join(" ") : "endpoint";
	}

	toEndpointLog(): endpointLog {
		const endpointLog: endpointLog = {
			message: this.primaryMessage(),
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
		if (this.event) {
			endpointLog.event = this.event;
		}
		if (this.outcome) {
			endpointLog.outcome = this.outcome;
		}
		if (this.route) {
			endpointLog.route = this.route;
		}
		if (this.requestId) {
			endpointLog.requestId = this.requestId;
		}
		if (this.messages && this.messages.length > 0) {
			endpointLog.messages = this.messages;
		}
		if (this.status) {
			endpointLog.status = this.status;
		}
		return endpointLog;
	}

	/**
	 * Terminal success/info write (`console.log`). Call once at end of request.
	 */
	emit(props?: StructuredLogProps): endpointLog {
		return this.flush("log", props);
	}

	/** Terminal warning write (`console.warn`). Call once at end of request. */
	emitWarn(props?: StructuredLogProps): endpointLog {
		return this.flush("warn", props);
	}

	/**
	 * Terminal error write (`console.error`). Prefer this over level string
	 * literals. Call once at end of request.
	 */
	emitError(props?: StructuredLogProps): endpointLog {
		return this.flush("error", props);
	}

	/**
	 * Whether a terminal emit has already written to the console.
	 * Useful for stream abort handlers that must not double-log.
	 */
	hasFlushed(): boolean {
		return this.flushed;
	}

	private flush(level: EndpointLogLevel, props?: StructuredLogProps): endpointLog {
		if (this.flushed) {
			return this.flushedPayload ?? this.toEndpointLog();
		}
		if (props) {
			this.add(props);
		}
		const payload = this.toEndpointLog();
		this.flushed = true;
		this.flushedPayload = payload;
		if (level === "error") {
			console.error(payload);
		} else if (level === "warn") {
			console.warn(payload);
		} else {
			console.log(payload);
		}
		return payload;
	}

	event?: string;
	outcome?: EndpointLogOutcome;
	route?: string;
	message?: string;
	requestId?: string;
	status?: number;
	country?: string;
	city?: string;
	userAgent?: string;
	clientTrustScoretr?: string;
	asn?: string;
	ipAddress?: string;
	verifiedBotCategory?: string;
	asOrganization?: string;
	messages?: string[];
}
