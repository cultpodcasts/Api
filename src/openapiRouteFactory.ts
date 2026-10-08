import { OpenAPIRoute, OpenAPIRouteSchema, contentJson } from "chanfana";
import { z } from "zod";
import { Auth0Middleware } from "./Auth0Middleware";
import { ambiguousIdsSchema, errorSchema } from "./openapiSchemas";

type RouteHandler = (c: any) => Promise<Response>;

/** Which JWT claim grants the permission. Default is `permissions` or `scope`. */
export type OpenApiAuth = {
	/** Caller must have one of these permissions. Omit when any valid token is enough. */
	anyOf?: readonly string[];
	/**
	 * Claims that are checked. `permissions` alone matches the R2 list handlers,
	 * which do not accept `scope`.
	 */
	claims?: readonly ("permissions" | "scope")[];
	/** Status when the token is missing or invalid. Bookmarks return 403. */
	unauthenticatedStatus?: 401 | 403;
	/**
	 * Token is optional. The operation stays callable without Authorization.
	 * Used by POST /submit, where a URL-only body is stored without a token.
	 */
	optional?: boolean;
};

export const curateAuth: OpenApiAuth = { anyOf: ["curate"] };
export const adminAuth: OpenApiAuth = { anyOf: ["admin"] };
export const submitOrCurateAuth: OpenApiAuth = { anyOf: ["submit", "curate"] };
export const curateOrAdminAuth: OpenApiAuth = { anyOf: ["curate", "admin"] };
/** R2 list handlers check `permissions` only, not `scope`. */
export const curatePermissionsClaimAuth: OpenApiAuth = {
	anyOf: ["curate"],
	claims: ["permissions"]
};
export const signedInAuth: OpenApiAuth = {};
export const bookmarkAuth: OpenApiAuth = { unauthenticatedStatus: 403 };
export const optionalSubmitAuth: OpenApiAuth = { optional: true };

type RouteFactoryOptions = {
	auth?: OpenApiAuth | boolean;
	schema?: OpenAPIRouteSchema;
};

const bearerSecurity = [{ bearerAuth: [] }];

function permissionList(anyOf: readonly string[]): string {
	return anyOf.map((permission) => `\`${permission}\``).join(" or ");
}

function applyOpenApiAuth(schema: OpenAPIRouteSchema, auth: OpenApiAuth | boolean | undefined) {
	if (auth == null || auth === false) {
		schema.security = [];
		return;
	}
	const requirement: OpenApiAuth = auth === true ? {} : auth;
	if (requirement.optional) {
		schema.security = [{}, ...bearerSecurity];
		const note =
			"Authentication is optional. A missing token may submit a URL-only body. " +
			"A body that includes podcastId or podcastName requires `submit` or `curate` " +
			"on the JWT `permissions` array or the `scope` claim. A missing token on that body is 401. " +
			"A token without either permission is 403. ID-token roles are not checked.";
		if (!schema.description?.includes("Authentication is optional")) {
			schema.description = schema.description ? `${note} ${schema.description}` : note;
		}
		return;
	}

	schema.security = [{ bearerAuth: [] }];
	const anyOf = requirement.anyOf ?? [];
	const unauthenticated = requirement.unauthenticatedStatus ?? 401;
	const claims = requirement.claims ?? ["permissions", "scope"];
	const claimText =
		claims.length === 1 && claims[0] === "permissions"
			? "Only the JWT `permissions` array is checked. A `scope` value alone is not accepted."
			: "The permission is read from the JWT `permissions` array or the space-delimited `scope` claim. ID-token roles are not checked.";
	const note =
		anyOf.length === 0
			? `Requires an Auth0 access token. Any valid token is enough. A missing or invalid token is ${unauthenticated}.`
			: `Requires an Auth0 access token with ${permissionList(anyOf)}. ${claimText} A missing or invalid token is ${unauthenticated}. A token without that permission is 403.`;
	if (!schema.description?.includes("Requires an Auth0 access token")) {
		schema.description = schema.description ? `${note} ${schema.description}` : note;
	}

	const responses: NonNullable<OpenAPIRouteSchema["responses"]> = { ...(schema.responses ?? {}) };
	if (unauthenticated === 401) {
		responses[401] = {
			description: "Unauthorized — missing or invalid access token",
			...contentJson(errorSchema)
		};
	} else {
		delete responses[401];
	}
	if (anyOf.length > 0) {
		responses[403] = {
			description: `Forbidden — authenticated without ${permissionList(anyOf)}`,
			...contentJson(errorSchema)
		};
	} else if (unauthenticated === 403) {
		responses[403] = {
			description: "Unauthorized — missing or invalid access token",
			...contentJson(errorSchema)
		};
	} else {
		delete responses[403];
	}
	schema.responses = responses;
}

export function registerBearerAuthScheme(registry: {
	registerComponent: (type: "securitySchemes", name: string, component: object) => unknown;
}) {
	registry.registerComponent("securitySchemes", "bearerAuth", {
		type: "http",
		scheme: "bearer",
		bearerFormat: "JWT",
		description:
			"Auth0 access token. Each protected operation names the permission it requires. " +
			"Unless that operation says otherwise, the permission may appear in `permissions` or in `scope`. " +
			"ID-token roles are not checked."
	});
}

export function createOpenApiRoute(handler: RouteHandler, options: RouteFactoryOptions = {}) {
	const schema: OpenAPIRouteSchema = options.schema ?? {};
	applyOpenApiAuth(schema, options.auth);
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
	...contentJson(ambiguousIdsSchema)
};

export const ambiguousCatalogueNameConflict = {
	description: "Ambiguous TV show or film name",
	...contentJson(ambiguousIdsSchema)
};

export const idParam = z.object({ id: z.string() });
export const nameParam = z.object({ name: z.string() });
export const identifierParam = z.object({ identifier: z.string() });
export const episodeIdParam = z.object({ episodeId: z.string().uuid() });
export const podcastAndEpisodeParam = z.object({ podcastName: z.string(), episodeId: z.string() });
export const podcastIdAndEpisodeParam = z.object({ podcastId: z.string(), episodeId: z.string() });
export const podcastNameAndIdParam = z.object({ name: z.string(), id: z.string() });
