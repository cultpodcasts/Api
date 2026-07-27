import { describe, expect, it } from "vitest";
import { formatCurateAuthzClaims } from "../src/jwtAuthzLog";
import type { Auth0JwtPayload } from "../src/Auth0JwtPayload";

function payload(partial: Partial<Auth0JwtPayload>): Auth0JwtPayload {
	return partial as Auth0JwtPayload;
}

describe("formatCurateAuthzClaims", () => {
	it("reports missing token without dumping secrets", () => {
		const msg = formatCurateAuthzClaims(null);
		expect(msg).toBe("reason=missing_or_invalid_token");
		expect(msg).not.toMatch(/Bearer|eyJ|signature/i);
	});

	it("surfaces permissions, scope, and curate presence flags for 403 diagnosis", () => {
		const msg = formatCurateAuthzClaims(
			payload({
				sub: "client@clients",
				azp: "m2m-client-id",
				permissions: ["submit"],
				scope: "openid profile",
				iss: "https://auth.example.com/",
				aud: "https://api.cultpodcasts.com"
			})
		);
		expect(msg).toContain("sub=client@clients");
		expect(msg).toContain("azp=m2m-client-id");
		expect(msg).toContain('permissions=["submit"]');
		expect(msg).toContain('scope="openid profile"');
		expect(msg).toContain("curateInPermissions=false");
		expect(msg).toContain("curateInScope=false");
		expect(msg).toContain("iss=https://auth.example.com/");
		expect(msg).toContain("aud=https://api.cultpodcasts.com");
		expect(msg).not.toMatch(/Bearer |eyJ[A-Za-z0-9_-]/);
	});

	it("falls back to client_id when azp absent and flags curate in scope", () => {
		const msg = formatCurateAuthzClaims(
			payload({
				sub: "m2m@clients",
				client_id: "edge-client",
				scope: "openid curate",
				iss: "https://auth.example.com/",
				aud: ["https://api.cultpodcasts.com"]
			})
		);
		expect(msg).toContain("azp=edge-client");
		expect(msg).toContain("curateInPermissions=false");
		expect(msg).toContain("curateInScope=true");
	});

	it("truncates oversized aud arrays", () => {
		const huge = Array.from({ length: 40 }, (_, i) => `aud-${i}-${"x".repeat(20)}`);
		const msg = formatCurateAuthzClaims(
			payload({
				sub: "u",
				azp: "c",
				permissions: ["curate"],
				scope: "curate",
				iss: "https://iss.example/",
				aud: huge
			})
		);
		expect(msg).toContain("aud=");
		expect(msg).toMatch(/…\(len=\d+\)/);
		expect(msg).toContain("curateInPermissions=true");
		expect(msg).toContain("curateInScope=true");
	});
});
