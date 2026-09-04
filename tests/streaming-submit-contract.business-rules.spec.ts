import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	STREAMING_SUBMIT_CONTRACT_COPY_FROM,
	STREAMING_SUBMIT_CONTRACT_JSON_COPY_FROM,
	defaultBrowserRenderingServices,
	htmlFetchModeForService,
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

	it("marks itvx as the only default Browser Rendering service", () => {
		const modes = Object.fromEntries(
			streamingServiceKeys.map((s: StreamingServiceKey) => [s, htmlFetchModeForService(s)])
		);
		expect(modes.itvx).toBe("browserRendering");
		for (const s of streamingServiceKeys.filter((k) => k !== "itvx")) {
			expect(modes[s]).toBe("directHttp");
		}
	});
});
