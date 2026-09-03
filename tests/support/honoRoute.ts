import { Hono } from "hono";
import type { Auth0JwtPayload } from "../../src/Auth0JwtPayload";
import type { Env } from "../../src/Env";

export function jwtPayload(partial: Partial<Auth0JwtPayload> = {}): Auth0JwtPayload {
	return {
		iss: "https://example.auth0.com/",
		sub: "user",
		aud: "https://api.cultpodcasts.com/",
		exp: 1,
		iat: 1,
		azp: "client",
		scope: "",
		permissions: [],
		...partial
	};
}

export function testEnv(overrides: Partial<Env> = {}): Env {
	const url = (path: string) => new URL(`https://azure.example/api/${path}`);
	return {
		shortner: {} as KVNamespace,
		Curated: {} as KVNamespace,
		auth0Issuer: "https://auth.example.com/",
		auth0Audience: "https://api.cultpodcasts.com/",
		auth0ClientId: "client",
		apihost: "https://search.example/",
		apikey: "key",
		secureSubmitEndpoint: url("SubmitUrl"),
		secureEpisodeEndpoint: url("episode"),
		securePublicEpisodeEndpoint: url("public-episode"),
		secureEpisodePublishEndpoint: url("episode-publish"),
		secureDiscoveryCurationEndpoint: url("DiscoveryCuration"),
		securePodcastIndexEndpoint: url("podcast-index"),
		securePodcastEndpoint: url("podcast"),
		secureSubjectEndpoint: url("subject"),
		securePeopleEndpoint: url("people"),
		secureEpisodesOutgoingEndpoint: url("episodes-outgoing"),
		secureAdminSearchIndexerEndpoint: url("search-indexer"),
		secureAdminPublishHomepageEndpoint: url("publish-homepage"),
		secureDiscoveryScheduleEndpoint: url("discovery-schedule"),
		secureSupportedLanguagesEndpoint: url("supported-languages"),
		secureTitleCasingRulesEndpoint: url("title-casing-rules"),
		securePushSubscriptionEndpoint: url("push"),
		stagingHostSuffix: ".pages.dev",
		PROFILE_DURABLE_OBJECT: {} as Env["PROFILE_DURABLE_OBJECT"],
		HERO_CURATION_DURABLE_OBJECT: {} as Env["HERO_CURATION_DURABLE_OBJECT"],
		Content: { get: async () => null } as unknown as R2Bucket,
		Data: {} as R2Bucket,
		apiDB: {} as D1Database,
		Analytics: {} as AnalyticsEngineDataset,
		overrideHost: undefined,
		...overrides
	};
}

type RouteMethod = "get" | "post" | "put" | "delete";

export function handlerApp(
	method: RouteMethod,
	path: string,
	handler: (c: any) => Promise<Response>,
	auth: Auth0JwtPayload | null | undefined
): Hono<{ Bindings: Env }> {
	const app = new Hono<{ Bindings: Env }>();
	app.use("*", async (c, next) => {
		c.set("auth0", () => auth ?? undefined);
		await next();
	});
	app[method](path, (c) => handler(c));
	return app;
}

export async function invokeRoute(
	app: Hono<{ Bindings: Env }>,
	input: string,
	init: RequestInit,
	env: Env
): Promise<Response> {
	return app.request(input, init, env);
}
