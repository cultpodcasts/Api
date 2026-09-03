import packageJson from "../package.json";

export type ApiEnvironment = "production" | "preview" | "local";

/** OpenAPI `info.version` — same value `fromHono` and `/openapi.json` rewrite use. */
export const openApiDocumentVersion: string = packageJson.version;

export function resolveApiEnvironment(
	envValue: string | undefined | null,
	hostname?: string
): ApiEnvironment {
	const normalized = (envValue ?? "").trim().toLowerCase();
	if (normalized === "preview" || normalized === "local" || normalized === "production") {
		return normalized;
	}
	if (hostname) {
		const host = hostname.toLowerCase();
		if (host === "api-preview.cultpodcasts.com" || host.startsWith("api-preview.")) {
			return "preview";
		}
		if (host.startsWith("local.") || host === "127.0.0.1" || host === "localhost") {
			return "local";
		}
	}
	return "production";
}

export function openApiInfoForEnvironment(environment: ApiEnvironment, version: string): {
	title: string;
	version: string;
	description?: string;
} {
	switch (environment) {
		case "preview":
			return {
				title: "Cult Podcasts API (Preview)",
				version,
				description:
					"Staging Worker (`api-preview`). Uses staging Auth0; proxies to Azure `api-infra`."
			};
		case "local":
			return {
				title: "Cult Podcasts API (Local)",
				version,
				description: "Local Wrangler (`wrangler dev --env local`)."
			};
		default:
			return {
				title: "Cult Podcasts API",
				version
			};
	}
}
