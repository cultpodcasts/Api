import { describe, expect, it } from "vitest";
import { surveyRecommendation } from "../src/streamingScrapeSurveyRecommend";

describe("surveyRecommendation", () => {
	it("keeps scrapeUsFetch as recommend when assumed geo and US leg succeeds even if Azure also ok", () => {
		const r = surveyRecommendation({
			azure: true,
			cfFetch: false,
			cfBr: false,
			cfUsFetch: true,
			assumedTechnique: "scrapeUsFetch"
		});
		expect(r.prefer).toBe("azurePrepare");
		expect(r.recommend).toBe("scrapeUsFetch");
		expect(r.geoFallback).toBe("scrapeUsFetch");
	});

	it("falls back to prefer when assumed geo but US leg fails", () => {
		const r = surveyRecommendation({
			azure: true,
			cfFetch: true,
			cfBr: false,
			cfUsFetch: false,
			assumedTechnique: "scrapeUsFetch"
		});
		expect(r.prefer).toBe("azurePrepare");
		expect(r.recommend).toBe("azurePrepare");
		expect(r.geoFallback).toBeNull();
	});

	it("keeps assumed scrapeUsFetch when US leg was skipped", () => {
		const r = surveyRecommendation({
			azure: true,
			cfFetch: null,
			cfBr: null,
			cfUsFetch: null,
			assumedTechnique: "scrapeUsFetch"
		});
		expect(r.recommend).toBe("scrapeUsFetch");
		expect(r.prefer).toBe("azurePrepare");
	});

	it("uses azure-first prefer as recommend when not assumed geo", () => {
		const r = surveyRecommendation({
			azure: true,
			cfFetch: true,
			cfBr: false,
			cfUsFetch: true,
			assumedTechnique: "azurePrepare"
		});
		expect(r.prefer).toBe("azurePrepare");
		expect(r.recommend).toBe("azurePrepare");
		expect(r.geoFallback).toBe("scrapeUsFetch");
	});
});
