import type { OpenApiAuth } from "./openapiRouteFactory";

/**
 * Compact auth annotation used by OpenAPI contract tests (Api #255).
 * Mirrors runtime gates: public, optional submit, signed-in, or a permission set.
 */
export type OpenApiAuthAnnotation =
	| { kind: "public" }
	| { kind: "optional-submit" }
	| {
			kind: "signed-in";
			/** Bookmarks return 403 when the token is missing. */
			unauthenticatedStatus: 401 | 403;
	  }
	| {
			kind: "authorised";
			anyOf: readonly string[];
			claims: readonly ("permissions" | "scope")[];
			unauthenticatedStatus: 401 | 403;
	  };

export function annotateOpenApiAuth(auth: OpenApiAuth | boolean | undefined): OpenApiAuthAnnotation {
	if (auth == null || auth === false) {
		return { kind: "public" };
	}
	const requirement: OpenApiAuth = auth === true ? {} : auth;
	if (requirement.optional) {
		return { kind: "optional-submit" };
	}
	const anyOf = requirement.anyOf ?? [];
	const unauthenticatedStatus = requirement.unauthenticatedStatus ?? 401;
	const claims = requirement.claims ?? (["permissions", "scope"] as const);
	if (anyOf.length === 0) {
		return { kind: "signed-in", unauthenticatedStatus };
	}
	return { kind: "authorised", anyOf, claims, unauthenticatedStatus };
}

type OpenApiOperation = {
	security?: unknown;
	description?: string;
	responses?: Record<string, { description?: string } | undefined>;
};

/** Read the auth annotation a published OpenAPI operation actually carries. */
export function annotationFromOpenApiOperation(op: OpenApiOperation): OpenApiAuthAnnotation {
	const security = op.security;
	if (!Array.isArray(security) || security.length === 0) {
		return { kind: "public" };
	}
	const hasEmpty = security.some(
		(entry) => entry != null && typeof entry === "object" && Object.keys(entry as object).length === 0
	);
	const hasBearer = security.some(
		(entry) =>
			entry != null &&
			typeof entry === "object" &&
			Object.prototype.hasOwnProperty.call(entry, "bearerAuth")
	);
	if (hasEmpty && hasBearer) {
		return { kind: "optional-submit" };
	}
	if (!hasBearer) {
		return { kind: "public" };
	}

	const description = op.description ?? "";
	const unauthenticatedStatus: 401 | 403 = op.responses?.["401"] ? 401 : 403;

	if (/Authentication is optional/i.test(description)) {
		return { kind: "optional-submit" };
	}
	if (/Any valid token is enough/i.test(description)) {
		return { kind: "signed-in", unauthenticatedStatus };
	}

	// Factory note: "Requires an Auth0 access token with `a` or `b`. …"
	const noteMatch = description.match(
		/Requires an Auth0 access token with ((?:`[^`]+`(?: or )?)+)/
	);
	const listed = noteMatch
		? [...noteMatch[1].matchAll(/`([^`]+)`/g)].map((m) => m[1])
		: [];

	const claims: ("permissions" | "scope")[] =
		/Only the JWT `permissions` array is checked/i.test(description)
			? ["permissions"]
			: ["permissions", "scope"];

	if (listed.length === 0) {
		return { kind: "signed-in", unauthenticatedStatus };
	}
	return {
		kind: "authorised",
		anyOf: listed,
		claims,
		unauthenticatedStatus
	};
}

export function authAnnotationsEqual(a: OpenApiAuthAnnotation, b: OpenApiAuthAnnotation): boolean {
	if (a.kind !== b.kind) {
		return false;
	}
	switch (a.kind) {
		case "public":
		case "optional-submit":
			return true;
		case "signed-in":
			return b.kind === "signed-in" && a.unauthenticatedStatus === b.unauthenticatedStatus;
		case "authorised":
			return (
				b.kind === "authorised" &&
				a.unauthenticatedStatus === b.unauthenticatedStatus &&
				a.claims.length === b.claims.length &&
				a.claims.every((claim, i) => claim === b.claims[i]) &&
				a.anyOf.length === b.anyOf.length &&
				a.anyOf.every((permission, i) => permission === b.anyOf[i])
			);
	}
}
