import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { discoveryCurationSessionStub } from "./DiscoveryCurationDurableObject";
import { hasPermission } from "./hasPermission";
import { LogCollector } from "./LogCollector";

function requireCurate(c: Auth0ActionContext, logCollector: LogCollector): Response | null {
	const auth0Payload: Auth0JwtPayload = c.var.auth0("payload");
	if (!auth0Payload) {
		logCollector.emitError({ event: "discovery_session.unauthorised", outcome: "unauthorised" });
		return c.json({ error: "Unauthorised" }, 401);
	}
	if (!hasPermission(auth0Payload, "curate")) {
		logCollector.emitError({ event: "discovery_session.forbidden", outcome: "forbidden" });
		return c.json({ error: "Forbidden" }, 403);
	}
	return null;
}

export function discoveryVoteRole(payload: Auth0JwtPayload): string {
	if (hasPermission(payload, "admin") || hasPermission(payload, "supervise")) {
		return "supervise";
	}
	if (hasPermission(payload, "curate:supervised")) {
		return "curate:supervised";
	}
	return "curate";
}

export async function getDiscoveryCurationSession(c: Auth0ActionContext): Promise<Response> {
	const logCollector = new LogCollector();
	logCollector.collectRequest(c);
	logCollector.add({ route: "getDiscoveryCurationSession" });
	AddResponseHeaders(c, { methods: ["GET", "POST", "OPTIONS"] });
	const denied = requireCurate(c, logCollector);
	if (denied) {
		return denied;
	}
	try {
		const resp = await discoveryCurationSessionStub(c.env).fetch("https://do/state");
		if (resp.ok) {
			logCollector.emit({ event: "discovery_session.get_ok", outcome: "success" });
		} else {
			logCollector.emitError({
				event: "discovery_session.get_upstream",
				outcome: "error",
				status: resp.status
			});
		}
		return c.newResponse(resp.body, resp.status as Parameters<typeof c.newResponse>[1]);
	} catch {
		logCollector.emitError({ event: "discovery_session.get_failed", outcome: "error" });
		return c.json({ error: "Failed to load discovery session" }, 500);
	}
}

async function postToSession(
	c: Auth0ActionContext,
	path: string,
	body: Record<string, unknown>,
	route: string
): Promise<Response> {
	const logCollector = new LogCollector();
	logCollector.collectRequest(c);
	logCollector.add({ route });
	AddResponseHeaders(c, { methods: ["GET", "POST", "OPTIONS"] });
	const denied = requireCurate(c, logCollector);
	if (denied) {
		return denied;
	}
	const payload: Auth0JwtPayload = c.var.auth0("payload");
	const userId = payload.sub ?? "";
	try {
		const resp = await discoveryCurationSessionStub(c.env).fetch(`https://do${path}`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				...body,
				userId,
				role: discoveryVoteRole(payload)
			})
		});
		if (resp.ok) {
			logCollector.emit({ event: `discovery_session.${route}_ok`, outcome: "success" });
		} else {
			logCollector.emitError({
				event: `discovery_session.${route}_do_error`,
				outcome: "error",
				status: resp.status
			});
		}
		// Forward DO status as-is (cast is Hono typing only; runtime uses resp.status).
		return c.newResponse(resp.body, resp.status as Parameters<typeof c.newResponse>[1]);
	} catch {
		logCollector.emitError({ event: `discovery_session.${route}_failed`, outcome: "error" });
		return c.json({ error: "Failed to update discovery session" }, 500);
	}
}

export async function postDiscoverySessionVote(c: Auth0ActionContext): Promise<Response> {
	let body: { resultId?: string; selected?: boolean };
	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: "Bad request" }, 400);
	}
	if (!body.resultId || typeof body.selected !== "boolean") {
		return c.json({ error: "resultId and selected required" }, 400);
	}
	return postToSession(c, "/vote", { resultId: body.resultId, selected: body.selected }, "vote");
}

export async function postDiscoverySessionSyncDocuments(c: Auth0ActionContext): Promise<Response> {
	let body: { documentIds?: string[] };
	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: "Bad request" }, 400);
	}
	if (!Array.isArray(body.documentIds)) {
		return c.json({ error: "documentIds required" }, 400);
	}
	return postToSession(c, "/sync-documents", { documentIds: body.documentIds }, "sync");
}

export async function postDiscoverySessionInclude(c: Auth0ActionContext): Promise<Response> {
	let body: { documentIds?: string[] | "all" };
	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: "Bad request" }, 400);
	}
	return postToSession(
		c,
		"/include",
		{ documentIds: body.documentIds ?? "all" },
		"include"
	);
}

export async function postDiscoverySessionClearVotes(c: Auth0ActionContext): Promise<Response> {
	let body: { resultIds?: string[] };
	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: "Bad request" }, 400);
	}
	if (!Array.isArray(body.resultIds)) {
		return c.json({ error: "resultIds required" }, 400);
	}
	return postToSession(c, "/clear-votes", { resultIds: body.resultIds }, "clear");
}

/** Authenticated WebSocket upgrade → DO hibernation socket. */
export async function upgradeDiscoveryCurationSessionWs(c: Auth0ActionContext): Promise<Response> {
	const logCollector = new LogCollector();
	logCollector.collectRequest(c);
	logCollector.add({ route: "discoveryCurationSessionWs" });
	const denied = requireCurate(c, logCollector);
	if (denied) {
		return denied;
	}
	const upgrade = c.req.header("Upgrade");
	if (!upgrade || upgrade.toLowerCase() !== "websocket") {
		return c.json({ error: "Expected WebSocket upgrade" }, 426);
	}
	const payload: Auth0JwtPayload = c.var.auth0("payload");
	const userId = payload.sub ?? "";
	if (!userId) {
		return c.json({ error: "Unauthorised" }, 401);
	}
	try {
		const stub = discoveryCurationSessionStub(c.env);
		return stub.fetch("https://do/ws", {
			headers: {
				Upgrade: "websocket",
				"X-User-Id": userId,
				"X-User-Role": discoveryVoteRole(payload)
			}
		});
	} catch {
		logCollector.emitError({ event: "discovery_session.ws_failed", outcome: "error" });
		return c.json({ error: "Failed to open discovery session socket" }, 500);
	}
}
