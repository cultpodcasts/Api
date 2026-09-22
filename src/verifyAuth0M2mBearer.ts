import { parseJwt } from "@cfworker/jwt";
import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { canCallAzureSubmitBackend } from "./submitAccess";

export type Auth0M2mVerifyResult =
	| { ok: true; payload: Auth0JwtPayload }
	| { ok: false; status: 401 | 403 | 500; error: string };

function trimValue(value: string | undefined | null): string {
	return (value ?? "").trim();
}

function normalizeIssuer(issuer: string): string {
	const t = trimValue(issuer);
	if (!t) {
		return "";
	}
	return t.endsWith("/") ? t : `${t}/`;
}

/** Auth0 client_credentials tokens: gty claim and/or `{clientId}@clients` subject. */
export function isAuth0M2mPayload(payload: Auth0JwtPayload | null | undefined): boolean {
	if (!payload) {
		return false;
	}
	const gty = (payload as Auth0JwtPayload & { gty?: string }).gty;
	if (gty === "client_credentials") {
		return true;
	}
	const sub = typeof payload.sub === "string" ? payload.sub : "";
	return sub.endsWith("@clients");
}

/**
 * Require a valid Auth0 M2M (client_credentials) Bearer for the Api audience,
 * with submit or curate (same gate as prepare/lookup).
 */
export async function verifyAuth0M2mBearer(
	authorizationHeader: string | null | undefined,
	auth0Issuer: string | undefined,
	auth0Audience: string | undefined
): Promise<Auth0M2mVerifyResult> {
	const issuer = normalizeIssuer(auth0Issuer ?? "");
	const audience = trimValue(auth0Audience);
	if (!issuer || !audience) {
		return { ok: false, status: 500, error: "auth0Issuer/auth0Audience not configured" };
	}

	const authorization = trimValue(authorizationHeader);
	const bearer = "Bearer ";
	if (!authorization.startsWith(bearer) || authorization.length <= bearer.length) {
		return { ok: false, status: 401, error: "Missing Bearer token" };
	}

	const token = authorization.slice(bearer.length);
	const result = await parseJwt(token, issuer, audience);
	if (!result.valid) {
		return { ok: false, status: 401, error: "Invalid JWT" };
	}

	const payload = result.payload as Auth0JwtPayload;
	if (!isAuth0M2mPayload(payload)) {
		return { ok: false, status: 403, error: "M2M (client_credentials) token required" };
	}
	if (!canCallAzureSubmitBackend(payload)) {
		return { ok: false, status: 403, error: "Missing submit or curate permission" };
	}

	return { ok: true, payload };
}
