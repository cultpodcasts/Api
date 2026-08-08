import { describe, expect, it } from "vitest";
import { openApiInfoForEnvironment, resolveApiEnvironment } from "../src/apiEnvironment";

describe("resolveApiEnvironment", () => {
	it("prefers explicit env var", () => {
		expect(resolveApiEnvironment("preview", "api.cultpodcasts.com")).toBe("preview");
		expect(resolveApiEnvironment("local", "api-preview.cultpodcasts.com")).toBe("local");
		expect(resolveApiEnvironment("production", "api-preview.cultpodcasts.com")).toBe("production");
	});

	it("falls back to hostname when env unset", () => {
		expect(resolveApiEnvironment(undefined, "api-preview.cultpodcasts.com")).toBe("preview");
		expect(resolveApiEnvironment("", "api-preview.jonbreen.workers.dev")).toBe("preview");
		expect(resolveApiEnvironment(null, "local.cultpodcasts.com")).toBe("local");
		expect(resolveApiEnvironment(undefined, "api.cultpodcasts.com")).toBe("production");
	});
});

describe("openApiInfoForEnvironment", () => {
	it("labels preview and local titles", () => {
		expect(openApiInfoForEnvironment("preview", "1.0.16").title).toBe(
			"Cult Podcasts API (Preview)"
		);
		expect(openApiInfoForEnvironment("local", "1.0.16").title).toBe(
			"Cult Podcasts API (Local)"
		);
		expect(openApiInfoForEnvironment("production", "1.0.16").title).toBe(
			"Cult Podcasts API"
		);
	});
});
