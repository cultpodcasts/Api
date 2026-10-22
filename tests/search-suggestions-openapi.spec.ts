import { describe, expect, it } from "vitest";
import { searchSuggestionEntrySchema, searchSuggestionsResponseSchema } from "../src/openapiSchemas";

describe("GET /search-suggestions OpenAPI", () => {
	it("documents TV show, news organisation and film rows, with id on films", () => {
		const parsed = searchSuggestionsResponseSchema.parse({
			generatedAtUtc: "2026-10-21T00:00:00Z",
			entries: [
				{ type: "subject", canonical: "Invented Topic", searchText: "invented topic" },
				{ type: "podcast", canonical: "Invented Podcast", searchText: "invented podcast" },
				{ type: "tvShow", canonical: "Invented Nightly", searchText: "invented nightly" },
				{ type: "newsOrganisation", canonical: "Invented Desk", searchText: "invented desk" },
				{ type: "film", canonical: "Invented Film", searchText: "invented film", id: "00112233-4455-4677-8899-aabbccddeeff" }
			]
		});
		expect(parsed.entries.map((e) => e.type)).toEqual(["subject", "podcast", "tvShow", "newsOrganisation", "film"]);
		expect(parsed.entries[4].id).toBe("00112233-4455-4677-8899-aabbccddeeff");
		expect(parsed.entries[2].id).toBeUndefined();
	});

	it("rejects an id that is not a guid", () => {
		expect(searchSuggestionEntrySchema.safeParse({
			type: "film", canonical: "Invented Film", searchText: "invented film", id: "not-a-guid"
		}).success).toBe(false);
	});
});
