import { AddResponseHeaders } from "./AddResponseHeaders";
import { ActionContext } from "./ActionContext";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { hasPermission } from "./hasPermission";
import { LogCollector } from "./LogCollector";
import {
	heroCurationAppendRequestSchema,
	heroCurationUpdateRequestSchema
} from "./openapiSchemas";
import { heroCurationStub } from "./HeroCurationDurableObject";

function requireCurate(c: Auth0ActionContext, logCollector: LogCollector): Response | null {
	const auth0Payload: Auth0JwtPayload = c.var.auth0("payload");
	if (!auth0Payload) {
		logCollector.addMessage("Unauthorised to mutate hero curation.");
		console.error(logCollector.toEndpointLog());
		return c.json({ error: "Unauthorised" }, 401);
	}
	if (!hasPermission(auth0Payload, "curate")) {
		logCollector.addMessage("Forbidden to mutate hero curation.");
		console.error(logCollector.toEndpointLog());
		return c.json({ error: "Forbidden" }, 403);
	}
	return null;
}

export async function getHeroCuration(c: ActionContext): Promise<Response> {
	const logCollector = new LogCollector();
	logCollector.collectRequest(c);
	AddResponseHeaders(c, {
		methods: ["GET", "PUT", "POST", "OPTIONS"],
		cacheControlMaxAge: 60
	});

	try {
		const state = await heroCurationStub(c.env).get();
		logCollector.addMessage("Successfully obtained hero curation.");
		console.log(logCollector.toEndpointLog());
		return c.json({
			episodeIds: state.episodeIds,
			railSubjects: state.railSubjects,
			updatedAt: state.updatedAt ?? null
		}, 200);
	} catch (error) {
		logCollector.addMessage("Unable to retrieve hero curation from Durable Object");
		console.error(logCollector.toEndpointLog(), error);
		return c.json({ error: "Failed to load hero curation" }, 500);
	}
}

export async function putHeroCuration(c: Auth0ActionContext): Promise<Response> {
	const logCollector = new LogCollector();
	logCollector.collectRequest(c);
	AddResponseHeaders(c, { methods: ["GET", "PUT", "POST", "OPTIONS"] });

	const denied = requireCurate(c, logCollector);
	if (denied) {
		return denied;
	}

	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		logCollector.addMessage("Invalid JSON body for putHeroCuration.");
		console.error(logCollector.toEndpointLog());
		return c.json({ error: "Bad request" }, 400);
	}

	const parsed = heroCurationUpdateRequestSchema.safeParse(body);
	if (!parsed.success) {
		logCollector.addMessage("Invalid hero curation body.");
		console.error(logCollector.toEndpointLog());
		return c.json({ error: "Bad request" }, 400);
	}
	if (!parsed.data.episodeIds && !parsed.data.railSubjects) {
		logCollector.addMessage("Hero curation body had neither episodeIds nor railSubjects.");
		console.error(logCollector.toEndpointLog());
		return c.json({ error: "Bad request" }, 400);
	}

	try {
		const result = await heroCurationStub(c.env).replace({
			episodeIds: parsed.data.episodeIds,
			railSubjects: parsed.data.railSubjects,
			expectedUpdatedAt: parsed.data.expectedUpdatedAt
		});
		if (!result.ok) {
			logCollector.addMessage("Hero curation conflict (expectedUpdatedAt mismatch).");
			console.warn(logCollector.toEndpointLog());
			return c.json({
				error: "Conflict",
				episodeIds: result.state.episodeIds,
				railSubjects: result.state.railSubjects,
				updatedAt: result.state.updatedAt
			}, 409);
		}

		logCollector.addMessage(
			`Hero curation updated (${result.state.episodeIds.length} episodeIds, ${result.state.railSubjects.length} railSubjects).`
		);
		console.log(logCollector.toEndpointLog());
		return c.json(result.state, 200);
	} catch (error) {
		logCollector.addMessage("Unable to store hero curation in Durable Object");
		console.error(logCollector.toEndpointLog(), error);
		return c.json({ error: "Failed to save hero curation" }, 500);
	}
}

export async function appendHeroCurationEpisodes(c: Auth0ActionContext): Promise<Response> {
	const logCollector = new LogCollector();
	logCollector.collectRequest(c);
	AddResponseHeaders(c, { methods: ["GET", "PUT", "POST", "OPTIONS"] });

	const denied = requireCurate(c, logCollector);
	if (denied) {
		return denied;
	}

	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		logCollector.addMessage("Invalid JSON body for appendHeroCurationEpisodes.");
		console.error(logCollector.toEndpointLog());
		return c.json({ error: "Bad request" }, 400);
	}

	const parsed = heroCurationAppendRequestSchema.safeParse(body);
	if (!parsed.success || parsed.data.episodeIds.length === 0) {
		logCollector.addMessage("Invalid hero curation append body.");
		console.error(logCollector.toEndpointLog());
		return c.json({ error: "Bad request" }, 400);
	}

	try {
		const requested = parsed.data.episodeIds;
		const state = await heroCurationStub(c.env).appendEpisodes(requested);
		logCollector.addMessage(
			`Hero auto-promote: DO append (${requested.length} requested, ${state.episodeIds.length} total). EpisodeIds: ${requested.join(",")}.`
		);
		console.log(logCollector.toEndpointLog());
		return c.json(state, 200);
	} catch (error) {
		logCollector.addMessage("Hero auto-promote: unable to append hero curation episodes");
		console.error(logCollector.toEndpointLog(), error);
		return c.json({ error: "Failed to append hero episodes" }, 500);
	}
}

