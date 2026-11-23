import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

vi.mock("workers-og", () => ({ ImageResponse: class ImageResponse {} }));

import type { Env } from "../src/Env";
import { openApiDocumentVersion } from "../src/apiEnvironment";
import { buildDocsPageHtml } from "../src/resources/docsPageHtml";
import { docsEnvBanner } from "../src/resources/docsChrome";
import { SEARCH_SHADOW_SOAK_PATH, searchShadowSoakPage } from "../src/searchShadowSoakPage";
import { testEnv } from "./honoTestApp";

async function soakHtml(host: string, env: Partial<Env> = {}): Promise<string> {
	const app = new Hono<{ Bindings: Env }>();
	app.get(SEARCH_SHADOW_SOAK_PATH, (c) => searchShadowSoakPage(c));
	const resp = await app.request(`https://${host}${SEARCH_SHADOW_SOAK_PATH}`, {}, testEnv(env));
	return resp.text();
}

describe("shared docs header (Api #310)", () => {
	it("gives the soak page the docs banner, version badge, API docs link and Logout, without the hamburger or the soak button", async () => {
		const html = await soakHtml("api-preview.cultpodcasts.com", { apiEnvironment: "preview" });
		expect(html).toContain(docsEnvBanner("preview"));
		expect(html).toContain("PREVIEW");
		expect(html).toContain("Staging Worker — not production");
		expect(html).toContain(`<span class="docs-version">${openApiDocumentVersion}</span>`);
		expect(html).toContain('<a class="logout" href="/docs">API docs</a>');
		expect(html).toContain('<a class="logout" href="/docs/logout">Logout</a>');
		expect(html).toContain("<title>Search shadow soak (Preview)</title>");
		expect(html).not.toContain("token-toggle");
		expect(html).not.toContain("hamburger");
		expect(html).not.toContain(`href="${SEARCH_SHADOW_SOAK_PATH}"`);
	});

	it("resolves the environment from the host like /docs does", async () => {
		expect(await soakHtml("api-preview.cultpodcasts.com")).toContain("Staging Worker — not production");
		const prod = await soakHtml("api.cultpodcasts.com", { apiEnvironment: "production" });
		expect(prod).not.toContain('class="env-banner"');
		expect(prod).toContain('<a class="logout" href="/docs/logout">Logout</a>');
	});

	it("keeps the docs page's hamburger, soak button, Logout and the same banner", () => {
		const html = buildDocsPageHtml({ apiEnvironment: "preview" });
		expect(html).toContain(docsEnvBanner("preview"));
		expect(html).toContain('id="token-toggle"');
		expect(html).toContain(`<a class="logout" href="${SEARCH_SHADOW_SOAK_PATH}">Search shadow soak</a>`);
		expect(html).toContain('<a class="logout" href="/docs/logout">Logout</a>');
		expect(buildDocsPageHtml({ apiEnvironment: "production" })).not.toContain('class="env-banner"');
	});

	it("titles both pages from the same environment suffix", async () => {
		expect(buildDocsPageHtml({ apiEnvironment: "preview" })).toContain("<title>Cult Podcasts API Docs (Preview)</title>");
		expect(buildDocsPageHtml({ apiEnvironment: "local" })).toContain("<title>Cult Podcasts API Docs (Local)</title>");
		expect(buildDocsPageHtml({ apiEnvironment: "production" })).toContain("<title>Cult Podcasts API Docs</title>");
		expect(await soakHtml("local.cultpodcasts.com", { apiEnvironment: "local" })).toContain("<title>Search shadow soak (Local)</title>");
	});
});
