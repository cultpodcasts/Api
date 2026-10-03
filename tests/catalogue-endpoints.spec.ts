import { describe, expect, it } from "vitest";
import { AzureResourcePaths } from "../src/azureResources";
import { Endpoint } from "../src/Endpoint";
import { getEndpoint } from "../src/endpoints";
import { testEnv } from "./honoTestApp";

describe("Azure endpoint registry", () => {
	it("builds catalogue paths from azureApiOrigin without rewriting podcast/episode secrets", () => {
		const env = testEnv({ azureApiOrigin: "https://functions.example" });
		expect(getEndpoint(Endpoint.tvShow, env).href).toBe("https://functions.example/api/tvshow");
		expect(getEndpoint(Endpoint.film, env).href).toBe("https://functions.example/api/film");
		expect(getEndpoint(Endpoint.tvShowEpisode, env).href).toBe(
			"https://functions.example/api/tvshowepisode"
		);
		expect(getEndpoint(Endpoint.person, env).href).toBe("https://functions.example/api/person");
		expect(getEndpoint(Endpoint.podcast, env).href).toBe("https://functions.example/api/podcast");
		expect(getEndpoint(Endpoint.episode, env).href).toBe("https://functions.example/api/episode");
	});

	it("strips an accidental path on azureApiOrigin", () => {
		const env = testEnv({ azureApiOrigin: "https://functions.example/api/podcast" });
		expect(getEndpoint(Endpoint.film, env).href).toBe("https://functions.example/api/film");
	});

	it("applies overrideHost and keeps the catalog path", () => {
		const env = testEnv({
			azureApiOrigin: "https://functions.example",
			overrideHost: "127.0.0.1:7071"
		});
		const url = getEndpoint(Endpoint.submit, env);
		expect(url.host).toBe("127.0.0.1:7071");
		expect(url.protocol).toBe("https:");
		expect(url.pathname).toBe("/api/SubmitUrl");
	});

	it("registers every Endpoint enum member", () => {
		const members = Object.values(Endpoint).filter((v): v is Endpoint => typeof v === "number");
		for (const endpoint of members) {
			expect(AzureResourcePaths[endpoint]).toMatch(/^\/api\//);
			expect(() => getEndpoint(endpoint, testEnv())).not.toThrow();
		}
	});
});
