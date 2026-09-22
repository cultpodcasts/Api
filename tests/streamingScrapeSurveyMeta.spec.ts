import { describe, expect, it } from "vitest";
import {
	formatMetaCoverage,
	metaCoverageFromExtractBody,
	SURVEY_META_FIELDS
} from "../src/streamingScrapeSurveyMeta";

describe("streamingScrapeSurveyMeta", () => {
	it("marks complete when all prepare fields are present", () => {
		const meta = metaCoverageFromExtractBody({
			title: "Ep",
			podcastName: "Show",
			description: "Desc",
			publisher: "Peacock",
			image: "https://example.com/i.jpg",
			duration: "01:00:00",
			release: "2020-01-01T00:00:00Z"
		});
		expect(meta.complete).toBe(true);
		expect(meta.missing).toEqual([]);
		expect(meta.present).toEqual([...SURVEY_META_FIELDS]);
		expect(formatMetaCoverage(meta)).toContain("metaComplete=true");
	});

	it("lists missing duration and release when SEO HTML only has OG identity fields", () => {
		const meta = metaCoverageFromExtractBody({
			title: "Watch Show",
			podcastName: "Show",
			description: "Desc",
			publisher: "Peacock",
			image: "https://example.com/i.jpg"
		});
		expect(meta.complete).toBe(false);
		expect(meta.missing).toEqual(["duration", "release"]);
	});
});
