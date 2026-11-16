import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	LIVE_AZURE_RETRIEVABLE_KEYS,
	formatAzureRelease,
	toAzureSearchDocument,
	toAzureSearchEnvelope,
	type AzureSearchDocRow
} from "../search-demo/src/azure-response";

const fixturePath = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "azure-docs-search-response.json");
const azureResponse = JSON.parse(readFileSync(fixturePath, "utf8")) as {
	"@odata.context": null;
	"@odata.count": number;
	value: Record<string, unknown>[];
};

const expectedDoc = azureResponse.value[0]!;

function rowFromFixture(): AzureSearchDocRow {
	return {
		id: expectedDoc.id as string,
		kind: expectedDoc.contentKind as string,
		title: expectedDoc.title as string,
		series_name: expectedDoc.seriesName as string,
		description: expectedDoc.description as string,
		release: Date.parse(expectedDoc.release as string) / 1000,
		duration: expectedDoc.duration as string,
		lang: expectedDoc.lang as string | null,
		spotify_id: expectedDoc.spotifyId as string,
		youtube_id: expectedDoc.youtubeId as string,
		apple_id: expectedDoc.appleId as string,
		podcast_apple_id: expectedDoc.podcastAppleId as string,
		image: expectedDoc.image as string,
		svc: expectedDoc.svc as string,
		bbc: expectedDoc.bbc as string
	};
}

describe("search-demo Azure response shape (SP-0.2)", () => {
	it("formats release as Azure does, without .000Z milliseconds", () => {
		expect(formatAzureRelease(0)).toBe("1970-01-01T00:00:00Z");
		expect(formatAzureRelease(Date.parse("2026-10-01T10:00:00Z") / 1000)).toBe("2026-10-01T10:00:00Z");
		expect(formatAzureRelease(0)).not.toMatch(/\.\d{3}Z$/);
	});

	it("maps a D1 row onto the live Azure document keys, including identity ids as null, with no extra podcastName", () => {
		const mapped = toAzureSearchDocument(rowFromFixture(), expectedDoc["@search.score"] as number, expectedDoc.subjects as string[]);
		expect(LIVE_AZURE_RETRIEVABLE_KEYS).toHaveLength(25);
		expect(Object.keys(mapped)).toEqual(["@search.score", ...LIVE_AZURE_RETRIEVABLE_KEYS]);
		expect(mapped).toEqual(expectedDoc);
		expect(mapped).not.toHaveProperty("podcastName");
		expect(mapped.alternativeTitles).toBeNull();
		expect(mapped.imdbId).toBeNull();
		expect(mapped.tmdbId).toBeNull();
		expect(mapped.tvdbId).toBeNull();
		expect(mapped.seriesImdbId).toBeNull();
		expect(mapped.seriesTmdbId).toBeNull();
		expect(mapped.seriesTvdbId).toBeNull();
	});

	it("keeps @odata.context null on the envelope, matching the api Worker", () => {
		const body = toAzureSearchEnvelope(
			[toAzureSearchDocument(rowFromFixture(), expectedDoc["@search.score"] as number, expectedDoc.subjects as string[])],
			{ count: azureResponse["@odata.count"] }
		);
		expect(body).toEqual(azureResponse);
		expect(body).toHaveProperty("@odata.context", null);
	});
});
