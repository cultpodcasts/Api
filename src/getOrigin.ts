import { AllowedOrigins } from "./AllowedOrigins";

/** `stagingHostSuffix` may be a single suffix or comma-separated (e.g. `website-83e.pages.dev,flix-ac4.pages.dev`). */
export function getOrigin(origin: string | null | undefined, stagingHostSuffix: string) {
	if (origin == null) {
		return AllowedOrigins[0];
	}
	const lower = origin.toLowerCase();
	if (AllowedOrigins.indexOf(lower) !== -1) {
		return origin;
	}
	const suffixes = (stagingHostSuffix ?? "")
		.split(",")
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
	if (suffixes.some((suffix) => lower.endsWith(suffix.toLowerCase()))) {
		return origin;
	}
	return AllowedOrigins[0];
}