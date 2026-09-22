/**
 * Catalogue meta fields prepare/extract should surface for streaming survey.
 * Survey reports presence after Azure prepare or Azure extract on prefetched HTML.
 */
export const SURVEY_META_FIELDS = [
	"title",
	"podcastName",
	"description",
	"publisher",
	"image",
	"duration",
	"release"
] as const;

export type SurveyMetaField = (typeof SURVEY_META_FIELDS)[number];

export type SurveyMetaCoverage = {
	title: string | null;
	podcastName: string | null;
	description: string | null;
	publisher: string | null;
	image: string | null;
	duration: string | null;
	release: string | null;
	present: SurveyMetaField[];
	missing: SurveyMetaField[];
	/** True when every {@link SURVEY_META_FIELDS} value is non-empty. */
	complete: boolean;
};

type ExtractBody = {
	title?: string | null;
	podcastName?: string | null;
	description?: string | null;
	publisher?: string | null;
	image?: string | null;
	duration?: string | null;
	release?: string | null;
	showName?: string | null;
};

function nonEmpty(v: unknown): string | null {
	if (v == null) {
		return null;
	}
	if (typeof v === "string") {
		const t = v.trim();
		return t.length > 0 ? t : null;
	}
	// TimeSpan / DateTime JSON may be objects or ISO strings
	const s = String(v).trim();
	return s.length > 0 && s !== "null" && s !== "undefined" ? s : null;
}

export function metaCoverageFromExtractBody(body: ExtractBody): SurveyMetaCoverage {
	const title = nonEmpty(body.title);
	const podcastName = nonEmpty(body.podcastName) ?? nonEmpty(body.showName);
	const description = nonEmpty(body.description);
	const publisher = nonEmpty(body.publisher);
	const image = nonEmpty(body.image);
	const duration = nonEmpty(body.duration);
	const release = nonEmpty(body.release);

	const values: Record<SurveyMetaField, string | null> = {
		title,
		podcastName,
		description,
		publisher,
		image,
		duration,
		release
	};

	const present = SURVEY_META_FIELDS.filter((f) => values[f] != null);
	const missing = SURVEY_META_FIELDS.filter((f) => values[f] == null);

	return {
		...values,
		present: [...present],
		missing: [...missing],
		complete: missing.length === 0
	};
}

export function formatMetaCoverage(meta: SurveyMetaCoverage): string {
	const bits = SURVEY_META_FIELDS.map((f) => `${f}=${meta[f] != null ? "yes" : "no"}`);
	return `metaComplete=${meta.complete} ${bits.join(" ")} missing=${meta.missing.join(",") || "none"}`;
}
