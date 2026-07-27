import { Auth0JwtPayload } from "./Auth0JwtPayload";

const AUD_MAX = 120;

function truncate(value: string | undefined, max = AUD_MAX): string {
	if (value == null || value === "") {
		return "(none)";
	}
	if (value.length <= max) {
		return value;
	}
	return `${value.slice(0, max)}…(len=${value.length})`;
}

function formatAud(aud: string | string[] | undefined): string {
	if (aud == null) {
		return "(none)";
	}
	if (Array.isArray(aud)) {
		return truncate(JSON.stringify(aud));
	}
	return truncate(aud);
}

/**
 * Safe JWT claim summary for curate authz failures.
 * Never include the raw Bearer token or signature.
 */
export function formatCurateAuthzClaims(
	payload: Auth0JwtPayload | null | undefined,
	permission = "curate"
): string {
	if (!payload) {
		return "reason=missing_or_invalid_token";
	}

	const permissions = Array.isArray(payload.permissions) ? payload.permissions : [];
	const scope = typeof payload.scope === "string" ? payload.scope : "";
	const scopeParts = scope.length > 0 ? scope.split(/\s+/).filter(Boolean) : [];
	const inPermissions = permissions.includes(permission);
	const inScope = scopeParts.includes(permission);
	const azp =
		(typeof payload.azp === "string" && payload.azp) ||
		(typeof payload.client_id === "string" && payload.client_id) ||
		"(none)";

	return [
		`sub=${payload.sub ?? "(none)"}`,
		`azp=${azp}`,
		`permissions=${JSON.stringify(permissions)}`,
		`scope=${JSON.stringify(scope)}`,
		`${permission}InPermissions=${inPermissions}`,
		`${permission}InScope=${inScope}`,
		`iss=${truncate(payload.iss)}`,
		`aud=${formatAud(payload.aud)}`
	].join(" ");
}
