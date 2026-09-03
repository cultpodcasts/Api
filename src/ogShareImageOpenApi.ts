import type { OpenAPIRouteSchema } from "chanfana";
import { ogImageQuerySchema } from "./openapiSchemas";

/** OpenAPI document for GET /og-image (used by the route factory at runtime). */
export const getOgShareImageOpenApiSchema: OpenAPIRouteSchema = {
	tags: ["Public"],
	summary: "Composed OG / Twitter share card",
	description:
		"Public PNG used as `og:image` / `twitter:image` (same URL as page-details `image`). " +
		"Successful 200s are stored in Workers Cache for 7 days (`X-Og-Cache: HIT|MISS`). " +
		"Source-fetch or compose failure returns 307 to `u`. No auth.",
	request: { query: ogImageQuerySchema },
	responses: {
		200: {
			description: "Composed card PNG. Header `X-Og-Cache`: HIT or MISS.",
			content: {
				"image/png": {
					schema: {
						type: "string",
						format: "binary"
					}
				}
			}
		},
		400: { description: "Missing or invalid `u`, non-https, or source host not allowlisted" },
		307: { description: "Fallback redirect; `Location` is the source art URL (`u`)" }
	}
};
