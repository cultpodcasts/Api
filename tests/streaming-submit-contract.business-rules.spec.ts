import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	streamingServiceKeySchema,
	submitUrlLookupResponseSchema
} from "../src/openapiSchemas";
import {
	STREAMING_SUBMIT_CONTRACT_COPY_FROM,
	STREAMING_SUBMIT_CONTRACT_JSON_COPY_FROM,
	defaultBrowserRenderingServices,
	htmlFetchModeForService,
	prepareUrlRewrites,
	resolvePrepareFetchUrl,
	resolveScrapeProfile,
	streamingLookupByUrl,
	streamingMembershipShapeCases,
	streamingOrchestrationCases,
	streamingServiceKeys,
	streamingSpecimenUrls,
	streamingSubmitContractJsonPayload,
	type StreamingServiceKey
} from "./fixtures/streaming-submit-contract";

const here = dirname(fileURLToPath(import.meta.url));

describe("streaming-submit-contract (Api publisher)", () => {
	it("keeps OpenAPI streamingServiceKeySchema in lockstep with fixture streamingServiceKeys", () => {
		expect([...streamingServiceKeySchema.options]).toEqual([...streamingServiceKeys]);
		for (const service of streamingServiceKeys) {
			expect(streamingServiceKeySchema.parse(service)).toBe(service);
		}
		expect(() => streamingServiceKeySchema.parse("notAServiceKey")).toThrow();
	});

	it("parses OpenAPI lookup response schema for every membership shape specimen with service", () => {
		for (const row of streamingMembershipShapeCases) {
			expect(submitUrlLookupResponseSchema.parse(row.body)).toEqual(row.body);
		}
		expect(() =>
			submitUrlLookupResponseSchema.parse({
				known: false,
				kind: "streaming",
				service: "notAServiceKey"
			})
		).toThrow();
	});

	it("lists every streaming ServiceKey exactly once", () => {
		expect(new Set(streamingServiceKeys).size).toBe(streamingServiceKeys.length);
		expect(streamingServiceKeys).not.toContain("spotify");
		expect(streamingServiceKeys).not.toContain("apple");
		expect(streamingServiceKeys).not.toContain("youtube");
	});

	it("has a specimen URL and lookup fake for every streaming service", () => {
		for (const service of streamingServiceKeys) {
			const url = streamingSpecimenUrls[service];
			expect(url, service).toMatch(/^https:\/\//);
			expect(streamingLookupByUrl[url]).toEqual({
				known: false,
				kind: "streaming",
				service
			});
		}
	});

	it("covers membership shape permutations for every service × arm", () => {
		expect(streamingMembershipShapeCases).toHaveLength(streamingServiceKeys.length * 3);
		for (const row of streamingMembershipShapeCases) {
			expect(row.body.kind).toBe("streaming");
			expect(row.body.service).toBe(row.service);
			if (row.arm === "known") {
				expect(row.body).toMatchObject({ known: true, podcastId: expect.any(String) });
			} else if (row.arm === "unknown") {
				expect(row.body).toMatchObject({ known: false });
				expect(row.body).not.toHaveProperty("ambiguous");
			} else {
				expect(row.body).toMatchObject({ known: false, ambiguous: true, podcastIds: expect.any(Array) });
			}
		}
	});

	it("derives orchestration cases: lookup → prepare → submit with fetch mode from BR allowlist", () => {
		expect(streamingOrchestrationCases).toHaveLength(streamingServiceKeys.length);
		expect(defaultBrowserRenderingServices).toEqual(["itvx"]);

		for (const c of streamingOrchestrationCases) {
			expect(c.steps.map((s) => s.name)).toEqual(["lookup", "prepare", "submit"]);
			expect(c.htmlFetchMode).toBe(htmlFetchModeForService(c.service));
			const prepare = c.steps[1];
			expect(prepare.name).toBe("prepare");
			if (prepare.name === "prepare") {
				expect(prepare.htmlFetchMode).toBe(c.htmlFetchMode);
			}
			const submit = c.steps[2];
			expect(submit.name).toBe("submit");
			if (submit.name === "submit") {
				expect(submit.usesPrefetchedMeta).toBe(true);
			}
			if (c.service === "itvx") {
				expect(c.htmlFetchMode).toBe("browserRendering");
			} else {
				expect(c.htmlFetchMode).toBe("directHttp");
			}
		}
	});

	it("keeps committed JSON snapshot identical to streamingSubmitContractJsonPayload()", () => {
		const path = join(here, "fixtures", "streaming-submit-contract.json");
		const onDisk = JSON.parse(readFileSync(path, "utf8"));
		expect(onDisk).toEqual(streamingSubmitContractJsonPayload());
		expect(STREAMING_SUBMIT_CONTRACT_COPY_FROM).toContain("streaming-submit-contract.ts");
		expect(STREAMING_SUBMIT_CONTRACT_JSON_COPY_FROM).toContain("streaming-submit-contract.json");
	});

	it("uses scrapeProfiles for Hulu/Peacock (US directHttp) and default allowlist for itvx", () => {
		const modes = Object.fromEntries(
			streamingServiceKeys.map((s: StreamingServiceKey) => [s, htmlFetchModeForService(s)])
		);
		expect(modes.itvx).toBe("browserRendering");
		expect(modes.hulu).toBe("directHttp");
		expect(modes.peacock).toBe("directHttp");
		expect(resolveScrapeProfile("hulu")).toEqual({ mode: "directHttp", region: "us" });
		expect(resolveScrapeProfile("peacock")).toEqual({ mode: "directHttp", region: "us" });
		expect(resolveScrapeProfile("itvx").region).toBe("default");
		for (const s of streamingServiceKeys.filter(
			(k) => k !== "itvx" && k !== "hulu" && k !== "peacock"
		)) {
			expect(modes[s]).toBe("directHttp");
			expect(resolveScrapeProfile(s).region).toBe("default");
		}
	});

	it("declares Peacock prepareUrlRewrites and resolves asset→watch-online before regional scrape", () => {
		expect(prepareUrlRewrites.peacock).toEqual({
			fromPathPrefix: "/watch/asset/",
			toPathPrefix: "/watch-online/",
			segmentRemaps: { movie: "movies" },
			hostSuffix: "peacocktv.com"
		});
		const asset =
			"https://www.peacocktv.com/watch/asset/tv/the-office-uk/8893980556248533112/seasons/1/episodes/work-experience-episode-2/9694b7a9-ffae-3b84-9606-5f852ccffee0";
		const seo =
			"https://www.peacocktv.com/watch-online/tv/the-office-uk/8893980556248533112/seasons/1/episodes/work-experience-episode-2/9694b7a9-ffae-3b84-9606-5f852ccffee0";
		expect(resolvePrepareFetchUrl("peacock", asset)).toEqual({
			requestUrl: seo,
			rewrittenTo: seo
		});
		expect(resolvePrepareFetchUrl("peacock", seo)).toEqual({
			requestUrl: seo,
			rewrittenTo: null
		});
		expect(resolvePrepareFetchUrl("hulu", asset).rewrittenTo).toBeNull();
	});
});
