import { AddResponseHeaders } from "./AddResponseHeaders";
import { ActionContext } from "./ActionContext";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { LogCollector } from "./LogCollector";
import { heroCurationUpdateRequestSchema } from "./openapiSchemas";

const HERO_KV_KEY = "hero-episode-ids";
const MAX_EPISODE_IDS = 50;
const MAX_RAIL_SUBJECTS = 12;

type HeroCurationStored = {
	episodeIds: string[];
	railSubjects: string[];
	updatedAt: string;
};

function dedupeAndCap(values: string[], max: number): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const value of values) {
		if (seen.has(value)) {
			continue;
		}
		seen.add(value);
		result.push(value);
		if (result.length >= max) {
			break;
		}
	}
	return result;
}

function storedList(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

async function readStored(kv: KVNamespace): Promise<HeroCurationStored | null> {
	const stored = await kv.get<Partial<HeroCurationStored>>(HERO_KV_KEY, "json");
	if (!stored) {
		return null;
	}
	return {
		episodeIds: storedList(stored.episodeIds),
		railSubjects: storedList(stored.railSubjects),
		updatedAt: stored.updatedAt ?? new Date(0).toISOString()
	};
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
		stored = await readStored(c.env.Curated);
	} catch {
		logCollector.addMessage("Unable to retrieve hero curation from KV");
		console.error(logCollector.toEndpointLog());
		return c.json({ error: "Failed to load hero curation" }, 500);
	}

	if (!stored) {
		logCollector.addMessage("Hero curation empty (no KV value).");
		console.log(logCollector.toEndpointLog());
		return c.json({ episodeIds: [], railSubjects: [], updatedAt: null }, 200);
	}

	logCollector.addMessage("Successfully obtained hero curation.");
	console.log(logCollector.toEndpointLog());
	return c.json({
		episodeIds: stored.episodeIds,
		railSubjects: stored.railSubjects,
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
	if (!parsed.data.episodeIds && !parsed.data.railSubjects) {
		logCollector.addMessage("Hero curation body had neither episodeIds nor railSubjects.");
		console.error(logCollector.toEndpointLog());
		return c.json({ error: "Bad request" }, 400);
	}

	// Merge so a hero-only or rails-only update leaves the other list intact.
	let existing: HeroCurationStored | null = null;
	try {
		existing = await readStored(c.env.Curated);
	} catch {
		logCollector.addMessage("Unable to retrieve hero curation from KV");
		console.error(logCollector.toEndpointLog());
		return c.json({ error: "Failed to load hero curation" }, 500);
	}

	const episodeIds = parsed.data.episodeIds
		? dedupeAndCap(parsed.data.episodeIds, MAX_EPISODE_IDS)
		: existing?.episodeIds ?? [];
	const railSubjects = parsed.data.railSubjects
		? dedupeAndCap(parsed.data.railSubjects.map((subject) => subject.trim()).filter((subject) => subject.length > 0), MAX_RAIL_SUBJECTS)
		: existing?.railSubjects ?? [];
	const updatedAt = new Date().toISOString();
	const stored: HeroCurationStored = { episodeIds, railSubjects, updatedAt };

	try {
		await c.env.Curated.put(HERO_KV_KEY, JSON.stringify(stored));
	} catch {
		logCollector.addMessage("Unable to store hero curation in KV");
		console.error(logCollector.toEndpointLog());
		return c.json({ error: "Failed to save hero curation" }, 500);
	}

	logCollector.addMessage(`Hero curation updated (${episodeIds.length} episodeIds, ${railSubjects.length} railSubjects).`);
	console.log(logCollector.toEndpointLog());
	return c.json(stored, 200);
}
