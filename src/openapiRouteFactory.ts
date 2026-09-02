import { OpenAPIRoute, OpenAPIRouteSchema, contentJson } from "chanfana";
import { z } from "zod";
import { Auth0Middleware } from "./Auth0Middleware";
import { ambiguousPodcastIdsSchema, errorSchema } from "./openapiSchemas";

type RouteHandler = (c: any) => Promise<Response>;

type RouteFactoryOptions = {
	auth?: boolean;
	schema?: OpenAPIRouteSchema;
};

export function createOpenApiRoute(handler: RouteHandler, options: RouteFactoryOptions = {}) {
	const schema: OpenAPIRouteSchema = options.schema ?? {};
	const requiresAuth = Boolean(options.auth);

	return class extends OpenAPIRoute {
		static readonly openApiSchema: OpenAPIRouteSchema = schema;
		static readonly requiresAuth = requiresAuth;
		schema: OpenAPIRouteSchema = schema;

		async handle(c: any): Promise<Response> {
			if (options.auth) {
				const middlewareResult = await Auth0Middleware(c, async () => {});
				if (middlewareResult instanceof Response) {
					return middlewareResult;
				}
			}
			return handler(c);
		}
	};
}

/**
 * Auth response matrix (Wave 2 Vitest: auth-matrix.spec.ts):
 * - 401 Unauthorized: missing or invalid bearer / Auth0 payload
 * - 403 Forbidden: authenticated but missing required permission (e.g. curate, admin)
 *
 * Proxied Azure routes also surface upstream 4xx via forwardStatuses / passthrough.
 */
export const authResponses = {
	401: {
		description: "Unauthorized — missing or invalid authentication",
		...contentJson(errorSchema)
	},
	403: {
		description: "Forbidden — authenticated but missing required permission",
		...contentJson(errorSchema)
	}
};

export const notFoundResponse = {
	404: {
		description: "Not found",
		...contentJson(errorSchema)
	}
};

export const serverErrorResponse = {
	500: {
		description: "Upstream or worker failure",
		...contentJson(errorSchema)
	}
};

export const ambiguousPodcastNameConflict = {
	description: "Ambiguous podcast name",
	...contentJson(ambiguousPodcastIdsSchema)
};

export const idParam = z.object({ id: z.string() });
export const nameParam = z.object({ name: z.string() });
export const episodeIdParam = z.object({ episodeId: z.string().uuid() });
export const podcastAndEpisodeParam = z.object({ podcastName: z.string(), episodeId: z.string() });
export const podcastIdAndEpisodeParam = z.object({ podcastId: z.string(), episodeId: z.string() });
export const podcastNameAndIdParam = z.object({ name: z.string(), id: z.string() });
