import { Auth0JwtPayload } from "./Auth0JwtPayload";
import { hasPermission } from "./hasPermission";

/**
 * Public Worker gate for the Azure Isolated submit/lookup backend.
 * Product rule (3 Sep 2026): only a Curator may call real lookup / Azure persist.
 * The JWT has no "Curator" role claim — Curator is the `curate` permission
 * (permissions[] and/or OAuth scope). `submit` alone is not enough.
 */
export function canCallAzureSubmitBackend(
	payload: Auth0JwtPayload | null | undefined
): boolean {
	return hasPermission(payload, "curate");
}

/** Missing/invalid JWT → 401; authenticated without Curator/`curate` → 403. */
export function azureSubmitBackendDenialStatus(
	payload: Auth0JwtPayload | null | undefined
): 401 | 403 {
	return payload == null ? 401 : 403;
}
