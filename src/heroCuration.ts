import { AddResponseHeaders } from "./AddResponseHeaders";
import { ActionContext } from "./ActionContext";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { hasPermission } from "./hasPermission";
import { formatCurateAuthzClaims } from "./jwtAuthzLog";
import { LogCollector } from "./LogCollector";
import {
	heroCurationAppendRequestSchema,
	heroCurationUpdateRequestSchema
} from "./openapiSchemas";
import { heroCurationStub } from "./HeroCurationDurableObject";

function requireCurate(c: Auth0ActionContext, logCollector: LogCollector): Response | null {
	const auth0Payload: Auth0JwtPayload = c.var.auth0("payload");
	if (!auth0Payload) {
		logCollector.add({ message: `Hero curation authz 401: missing or invalid Auth0 payload. ${formatCurateAuthzClaims(null)}` });
		logCollector.emitError({ event: "hero_curation.unauthorised", outcome: "unauthorised" });
		return c.json({ error: "Unauthorised" }, 401);
	}
	if (!hasPermission(auth0Payload, "curate")) {
		logCollector.add({ message: `Hero curation authz 403: missing curate. ${formatCurateAuthzClaims(auth0Payload)}` });
		logCollector.emitError({ event: "hero_curation.forbidden", outcome: "forbidden" });
		return c.json({ error: "Forbidden" }, 403);
	}
	return null;
}

export async function getHeroCuration(c: ActionContext): Promise<Response> {
	const logCollector = new LogCollector();
	logCollector.collectRequest(c);
	logCollector.add({ route: "getHeroCuration" });
	AddResponseHeaders(c, {
		methods: ["GET", "PUT", "POST", "DELETE", "OPTIONS"],
		cacheControlMaxAge: 60
	});

	try {
		const state = await heroCurationStub(c.env).get();
		logCollector.emit({ event: "hero_curation.get_ok", outcome: "success" });
		return c.json({
			episodeIds: state.episodeIds,
			railSubjects: state.railSubjects,
			updatedAt: state.updatedAt ?? null
		}, 200);
	} catch {
		logCollector.emitError({ event: "hero_curation.get_failed", outcome: "error" });
		return c.json({ error: "Failed to load hero curation" }, 500);
	}
}

export async function putHeroCuration(c: Auth0ActionContext): Promise<Response> {
	const logCollector = new LogCollector();
	logCollector.collectRequest(c);
	logCollector.add({ route: "putHeroCuration" });
	AddResponseHeaders(c, { methods: ["GET", "PUT", "POST", "DELETE", "OPTIONS"] });

	const denied = requireCurate(c, logCollector);
	if (denied) {
		return denied;
	}

	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		logCollector.emitError({ event: "hero_curation.put_bad_json", outcome: "error" });
		return c.json({ error: "Bad request" }, 400);
	}

	const parsed = heroCurationUpdateRequestSchema.safeParse(body);
	if (!parsed.success) {
		logCollector.emitError({ event: "hero_curation.put_invalid_body", outcome: "error" });
		return c.json({ error: "Bad request" }, 400);
	}
	if (!parsed.data.episodeIds && !parsed.data.railSubjects) {
		logCollector.emitError({ event: "hero_curation.put_empty_body", outcome: "error" });
		return c.json({ error: "Bad request" }, 400);
	}

	try {
		const result = await heroCurationStub(c.env).replace({
			episodeIds: parsed.data.episodeIds,
			railSubjects: parsed.data.railSubjects,
			expectedUpdatedAt: parsed.data.expectedUpdatedAt
		});
		if (!result.ok) {
			logCollector.emitWarn({ event: "hero_curation.put_conflict", outcome: "error" });
			return c.json({
				error: "Conflict",
				episodeIds: result.state.episodeIds,
				railSubjects: result.state.railSubjects,
				updatedAt: result.state.updatedAt
			}, 409);
		}

		logCollector.emit({ event: "hero_curation.put_ok", outcome: "success" });
		return c.json(result.state, 200);
	} catch {
		logCollector.emitError({ event: "hero_curation.put_failed", outcome: "error" });
		return c.json({ error: "Failed to save hero curation" }, 500);
	}
}

export async function appendHeroCurationEpisodes(c: Auth0ActionContext): Promise<Response> {
	const logCollector = new LogCollector();
	logCollector.collectRequest(c);
	logCollector.add({ route: "appendHeroCurationEpisodes" });
	AddResponseHeaders(c, { methods: ["GET", "PUT", "POST", "DELETE", "OPTIONS"] });

	const denied = requireCurate(c, logCollector);
	if (denied) {
		return denied;
	}

	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		logCollector.emitError({ event: "hero_curation.append_bad_json", outcome: "error" });
		return c.json({ error: "Bad request" }, 400);
	}

	const parsed = heroCurationAppendRequestSchema.safeParse(body);
	if (!parsed.success || parsed.data.episodeIds.length === 0) {
		logCollector.emitError({ event: "hero_curation.append_invalid_body", outcome: "error" });
		return c.json({ error: "Bad request" }, 400);
	}

	try {
		const requested = parsed.data.episodeIds;
		const state = await heroCurationStub(c.env).appendEpisodes(requested);
		logCollector.add({ message: `Hero auto-promote: ${requested.length} requested, ${state.episodeIds.length} total` });
		logCollector.emit({ event: "hero_curation.append_ok", outcome: "success" });
		return c.json(state, 200);
	} catch {
		logCollector.emitError({ event: "hero_curation.append_failed", outcome: "error" });
		return c.json({ error: "Failed to append hero episodes" }, 500);
	}
}

export async function deleteHeroCurationEpisodes(c: Auth0ActionContext): Promise<Response> {
	const logCollector = new LogCollector();
	logCollector.collectRequest(c);
	logCollector.add({ route: "deleteHeroCurationEpisodes" });
	AddResponseHeaders(c, { methods: ["GET", "PUT", "POST", "DELETE", "OPTIONS"] });

	const denied = requireCurate(c, logCollector);
	if (denied) {
		return denied;
	}

	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		logCollector.emitError({ event: "hero_curation.delete_bad_json", outcome: "error" });
		return c.json({ error: "Bad request" }, 400);
	}

	const parsed = heroCurationAppendRequestSchema.safeParse(body);
	if (!parsed.success || parsed.data.episodeIds.length === 0) {
		logCollector.emitError({ event: "hero_curation.delete_invalid_body", outcome: "error" });
		return c.json({ error: "Bad request" }, 400);
	}

	try {
		const requested = parsed.data.episodeIds;
		const state = await heroCurationStub(c.env).removeEpisodes(requested);
		logCollector.add({ message: `Hero demote: ${requested.length} requested, ${state.episodeIds.length} total` });
		logCollector.emit({ event: "hero_curation.delete_ok", outcome: "success" });
		return c.json(state, 200);
	} catch {
		logCollector.emitError({ event: "hero_curation.delete_failed", outcome: "error" });
		return c.json({ error: "Failed to remove hero episodes" }, 500);
	}
}
