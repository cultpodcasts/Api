import { describe, expect, it } from "vitest";
import { hasPermission } from "../src/hasPermission";
import type { Auth0JwtPayload } from "../src/Auth0JwtPayload";

function payload(partial: Partial<Auth0JwtPayload>): Auth0JwtPayload {
	return partial as Auth0JwtPayload;
}

describe("hasPermission", () => {
	it("accepts curate from permissions claim", () => {
		expect(hasPermission(payload({ permissions: ["curate"] }), "curate")).toBe(true);
	});

	it("accepts curate from space-delimited scope when permissions absent", () => {
		expect(hasPermission(payload({ scope: "curate" }), "curate")).toBe(true);
		expect(hasPermission(payload({ scope: "openid curate profile" }), "curate")).toBe(true);
	});

	it("rejects when neither permissions nor scope grants the permission", () => {
		expect(hasPermission(payload({ scope: "openid profile", permissions: ["submit"] }), "curate")).toBe(false);
		expect(hasPermission(null, "curate")).toBe(false);
		expect(hasPermission(payload({}), "curate")).toBe(false);
	});
});
