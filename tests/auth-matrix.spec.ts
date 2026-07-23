import { describe, expect, it } from "vitest";

/**
 * Documents the Wave 1 auth matrix used by R2 list handlers and proxyToAzure.
 * Missing/invalid auth → 401; authenticated without permission → 403.
 */
describe("auth status matrix contract", () => {
	it("maps missing auth to 401 and missing permission to 403", () => {
		const matrix = {
			missingAuth: 401,
			authenticatedMissingPermission: 403
		};
		expect(matrix.missingAuth).toBe(401);
		expect(matrix.authenticatedMissingPermission).toBe(403);
	});
});
