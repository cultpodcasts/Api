import { Auth0JwtPayload } from "./Auth0JwtPayload";

/**
 * True when the JWT grants `permission` via the RBAC `permissions` claim
 * and/or the space-delimited OAuth `scope` claim.
 *
 * Auth0 M2M tokens always carry granted APIs in `scope`. The `permissions`
 * array is only present when the API has "Add Permissions in Access Token"
 * enabled (Auth0 Dashboard → APIs → api.cultpodcasts.com → Settings).
 * Edge callers (client_credentials) must not be locked out if that toggle
 * is off — hero auto-promote previously 403'd for that reason.
 */
export function hasPermission(
	payload: Auth0JwtPayload | null | undefined,
	permission: string
): boolean {
	if (!payload || !permission) {
		return false;
	}
	if (payload.permissions?.includes(permission)) {
		return true;
	}
	if (typeof payload.scope === "string" && payload.scope.length > 0) {
		return payload.scope.split(/\s+/).includes(permission);
	}
	return false;
}
