import { AllowedOrigins } from "./AllowedOrigins";

export function getOrigin(origin: string | null | undefined, stagingHostSuffix: string) {
	if (origin == null ||
		(AllowedOrigins.indexOf(origin.toLowerCase()) == -1 &&
			(stagingHostSuffix && !origin.endsWith(stagingHostSuffix)))) {
		origin = AllowedOrigins[0];
	}
	return origin;
}