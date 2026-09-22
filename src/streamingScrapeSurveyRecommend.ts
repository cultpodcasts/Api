/**
 * Survey ranking: production prefer (Azure-first this run) vs contract recommend.
 * Geo soft-wall services with assumedTechnique scrapeUsFetch keep US as contract
 * technique when the US leg succeeds — intermittent Azure success must not flip
 * the contract away from a deliberate geo fallback.
 */

export type SurveyLegFlags = {
	azure: boolean | null;
	cfFetch: boolean | null;
	cfBr: boolean | null;
	cfUsFetch: boolean | null;
	azureSkip?: boolean;
	assumedTechnique?: string | null;
};

export type SurveyRecommendation = {
	/** Azure-first ranking for this run (ops display). */
	prefer: string;
	/** Technique to compare against scrapeProfiles / BR allowlist. */
	recommend: string;
	/** Present when US fetch also succeeded (geo fallback available). */
	geoFallback: "scrapeUsFetch" | null;
};

function azureFirstPrefer(row: SurveyLegFlags): string {
	if (row.azure === true) {
		return "azurePrepare";
	}
	if (row.cfUsFetch === true) {
		return "scrapeUsFetch";
	}
	if (row.cfFetch === true) {
		return "cfDirectHttp";
	}
	if (row.cfBr === true) {
		return "browserRendering";
	}
	if (row.azureSkip) {
		return "unknown-run-with-azure";
	}
	return "blocked";
}

/**
 * Contract technique for this row.
 * When assumedTechnique is scrapeUsFetch: require US success to keep that
 * recommendation; Azure-only success must not auto-flip the geo profile away
 * while the US leg still works.
 */
export function surveyRecommendation(row: SurveyLegFlags): SurveyRecommendation {
	const prefer = azureFirstPrefer(row);
	const geoFallback: "scrapeUsFetch" | null =
		row.cfUsFetch === true ? "scrapeUsFetch" : null;
	const assumed = (row.assumedTechnique ?? "").trim();

	if (assumed === "scrapeUsFetch") {
		if (row.cfUsFetch === true) {
			return { prefer, recommend: "scrapeUsFetch", geoFallback };
		}
		if (row.cfUsFetch === false) {
			// US geo path failed this run — prefer may be azurePrepare; do not
			// invent scrapeUsFetch without evidence.
			return { prefer, recommend: prefer, geoFallback: null };
		}
		// US leg skipped — keep assumed so compare does not invent drift.
		return { prefer, recommend: "scrapeUsFetch", geoFallback: null };
	}

	return { prefer, recommend: prefer, geoFallback };
}
