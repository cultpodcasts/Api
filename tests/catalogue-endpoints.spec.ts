import { describe, expect, it } from "vitest";
import { Endpoint } from "../src/Endpoint";
import { getEndpoint, rewriteTrailingSegment } from "../src/endpoints";
import { testEnv } from "./honoTestApp";

function catalogueEnv(overrides: {
	securePodcastEndpoint?: URL;
	secureEpisodeEndpoint?: URL;
} = {}) {
	return testEnv({
		securePodcastEndpoint: new URL("https://functions.example/api/podcast"),
		secureEpisodeEndpoint: new URL("https://functions.example/api/episode"),
		...overrides
	});
}

describe("catalogue Azure endpoint rewrite", () => {
	it.each([
		["https://functions.example/api/podcast", "podcast", "tvshow", "/api/tvshow"],
		["https://functions.example/api/podcast/", "podcast", "tvshow", "/api/tvshow"],
		["https://functions.example/api/podcast", "podcast", "film", "/api/film"],
		["https://functions.example/api/podcast/", "podcast", "film", "/api/film"],
		["https://functions.example/api/episode", "episode", "tvshowepisode", "/api/tvshowepisode"],
		["https://functions.example/api/episode/", "episode", "tvshowepisode", "/api/tvshowepisode"]
	] as const)("rewrites %s %s -> %s", (source, from, to, pathname) => {
		expect(rewriteTrailingSegment(source, from, to).pathname).toBe(pathname);
	});

	it("getEndpoint maps podcast/episode secrets to catalogue pathnames", () => {
		const env = catalogueEnv();
		expect(getEndpoint(Endpoint.tvShow, env).pathname).toBe("/api/tvshow");
		expect(getEndpoint(Endpoint.film, env).pathname).toBe("/api/film");
		expect(getEndpoint(Endpoint.tvShowEpisode, env).pathname).toBe("/api/tvshowepisode");
	});

	it("getEndpoint rewrites trailing-slash podcast and episode secrets", () => {
		const env = catalogueEnv({
			securePodcastEndpoint: new URL("https://functions.example/api/podcast/"),
			secureEpisodeEndpoint: new URL("https://functions.example/api/episode/")
		});
		expect(getEndpoint(Endpoint.tvShow, env).pathname).toBe("/api/tvshow");
		expect(getEndpoint(Endpoint.film, env).pathname).toBe("/api/film");
		expect(getEndpoint(Endpoint.tvShowEpisode, env).pathname).toBe("/api/tvshowepisode");
	});

	it("throws when the podcast secret path is unchanged", () => {
		const env = catalogueEnv({
			securePodcastEndpoint: new URL("https://functions.example/api/Podcast")
		});
		expect(() => getEndpoint(Endpoint.film, env)).toThrow(/Cannot derive \/film Azure URL/);
		expect(() => getEndpoint(Endpoint.tvShow, env)).toThrow(/Cannot derive \/tvshow Azure URL/);
	});

	it("throws when the episode secret path is unchanged", () => {
		const env = catalogueEnv({
			secureEpisodeEndpoint: new URL("https://functions.example/api/episodes")
		});
		expect(() => getEndpoint(Endpoint.tvShowEpisode, env)).toThrow(
			/Cannot derive \/tvshowepisode Azure URL/
		);
	});
});
