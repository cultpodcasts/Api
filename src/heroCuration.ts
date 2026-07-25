import { AddResponseHeaders } from "./AddResponseHeaders";
import { ActionContext } from "./ActionContext";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { LogCollector } from "./LogCollector";
import { heroCurationUpdateRequestSchema } from "./openapiSchemas";

const HERO_KV_KEY = "hero-episode-ids";
const MAX_EPISODE_IDS = 50;

type HeroCurationStored = {
	episodeIds: string[];
	updatedAt: string;
};

function dedupeAndCap(ids: string[]): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const id of ids) {
		if (seen.has(id)) {
			continue;
		}
		seen.add(id);
		result.push(id);
		if (result.length >= MAX_EPISODE_IDS) {
			break;
		}
	}
	return result;
}

export async function getHeroCuration(c: ActionContext): Promise<Response> {
	const logCollector = new LogCollector();
	logCollector.collectRequest(c);
	AddResponseHeaders(c, {
		methods: ["GET", "PUT", "OPTIONS"],
		cacheControlMaxAge: 60
	});

	let stored: HeroCurationStored | null = null;
	try {
		stored = await c.env.Curated.get(HERO_KV_KEY, "json");
	} catch {
		logCollector.addMessage("Unable to retrieve hero curation from KV");
		console.error(logCollector.toEndpointLog());
		return c.json({ error: "Failed to load hero curation" }, 500);
	}

	if (!stored) {
		logCollector.addMessage("Hero curation empty (no KV value).");
		console.log(logCollector.toEndpointLog());
		return c.json({ episodeIds: [], updatedAt: null }, 200);
	}

	logCollector.addMessage("Successfully obtained hero curation.");
	console.log(logCollector.toEndpointLog());
	return c.json({
		episodeIds: Array.isArray(stored.episodeIds) ? stored.episodeIds : [],
		updatedAt: stored.updatedAt ?? null
	}, 200);
}

export async function putHeroCuration(c: Auth0ActionContext): Promise<Response> {
	const auth0Payload: Auth0JwtPayload = c.var.auth0("payload");
	const logCollector = new LogCollector();
	logCollector.collectRequest(c);
	AddResponseHeaders(c, { methods: ["GET", "PUT", "OPTIONS"] });

	if (!auth0Payload) {
		logCollector.addMessage("Unauthorised to use putHeroCuration.");
		console.error(logCollector.toEndpointLog());
		return c.json({ error: "Unauthorised" }, 401);
	}
	if (!auth0Payload.permissions?.includes("curate")) {
		logCollector.addMessage("Forbidden to use putHeroCuration.");
		console.error(logCollector.toEndpointLog());
		return c.json({ error: "Forbidden" }, 403);
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

	const episodeIds = dedupeAndCap(parsed.data.episodeIds);
	const updatedAt = new Date().toISOString();
	const stored: HeroCurationStored = { episodeIds, updatedAt };

	try {
		await c.env.Curated.put(HERO_KV_KEY, JSON.stringify(stored));
	} catch {
		logCollector.addMessage("Unable to store hero curation in KV");
		console.error(logCollector.toEndpointLog());
		return c.json({ error: "Failed to save hero curation" }, 500);
	}

	logCollector.addMessage(`Hero curation updated (${episodeIds.length} episodeIds).`);
	console.log(logCollector.toEndpointLog());
	return c.json(stored, 200);
}
