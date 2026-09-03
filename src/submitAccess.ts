import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { hasPermission } from "./hasPermission";

/**
 * Public Worker gate for the Azure Isolated submit/lookup backend.
 * Product rule: JWT `submit` or `curate` may call real lookup / Azure persist.
 * UI maps `Submitter` / `Curator` Auth0 roles to these permissions.
 */
export function canCallAzureSubmitBackend(
	payload: Auth0JwtPayload | null | undefined
): boolean {
	return (
		hasPermission(payload, "submit") || hasPermission(payload, "curate")
	);
}

/** Permission to forward to Azure after the Worker gate (matches token claims). */
export function azureSubmitProxyPermission(
	payload: Auth0JwtPayload
): "submit" | "curate" {
	return hasPermission(payload, "curate") ? "curate" : "submit";
}

/** Missing/invalid JWT → 401; authenticated without submit/curate → 403. */
export function azureSubmitBackendDenialStatus(
	payload: Auth0JwtPayload | null | undefined
): 401 | 403 {
	return payload == null ? 401 : 403;
}
