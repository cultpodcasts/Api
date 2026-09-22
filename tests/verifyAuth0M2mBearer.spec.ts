import { describe, expect, it, vi, beforeEach } from "vitest";
import {
	isAuth0M2mPayload,
	verifyAuth0M2mBearer
} from "../src/verifyAuth0M2mBearer";
import type { Auth0JwtPayload } from "../src/Auth0JwtPayload";

vi.mock("@cfworker/jwt", () => ({
	parseJwt: vi.fn()
}));

import { parseJwt } from "@cfworker/jwt";

const issuer = "https://auth.example.com/";
const audience = "https://api.example.com/";

function m2mPayload(over: Partial<Auth0JwtPayload> = {}): Auth0JwtPayload {
	return {
		iss: issuer,
		aud: audience,
		sub: "abc123@clients",
		azp: "abc123",
		scope: "submit",
		permissions: ["submit"],
		...over
	} as Auth0JwtPayload;
}

describe("isAuth0M2mPayload", () => {
	it("accepts @clients subject", () => {
		expect(isAuth0M2mPayload(m2mPayload())).toBe(true);
	});

	it("accepts gty=client_credentials", () => {
		expect(
			isAuth0M2mPayload(
				m2mPayload({
					sub: "auth0|user",
					gty: "client_credentials"
				})
			)
		).toBe(true);
	});

	it("rejects SPA-style subject without gty", () => {
		expect(isAuth0M2mPayload(m2mPayload({ sub: "auth0|user-1", scope: "openid" }))).toBe(
			false
		);
	});
});

describe("verifyAuth0M2mBearer", () => {
	beforeEach(() => {
		vi.mocked(parseJwt).mockReset();
	});

	it("500 when Auth0 env missing", async () => {
		const r = await verifyAuth0M2mBearer("Bearer x", "", audience);
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.status).toBe(500);
		}
	});

	it("401 without Bearer", async () => {
		const r = await verifyAuth0M2mBearer(null, issuer, audience);
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.status).toBe(401);
		}
	});

	it("401 on invalid JWT", async () => {
		vi.mocked(parseJwt).mockResolvedValue({ valid: false } as never);
		const r = await verifyAuth0M2mBearer("Bearer bad", issuer, audience);
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.status).toBe(401);
		}
	});

	it("403 when JWT is not M2M", async () => {
		vi.mocked(parseJwt).mockResolvedValue({
			valid: true,
			payload: m2mPayload({ sub: "auth0|human", permissions: ["submit"], scope: "submit" })
		} as never);
		const r = await verifyAuth0M2mBearer("Bearer t", issuer, audience);
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.status).toBe(403);
			expect(r.error).toMatch(/M2M/);
		}
	});

	it("403 when M2M lacks submit/curate", async () => {
		vi.mocked(parseJwt).mockResolvedValue({
			valid: true,
			payload: m2mPayload({ permissions: [], scope: "read:something" })
		} as never);
		const r = await verifyAuth0M2mBearer("Bearer t", issuer, audience);
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.status).toBe(403);
			expect(r.error).toMatch(/submit or curate/);
		}
	});

	it("ok for M2M with submit", async () => {
		const payload = m2mPayload();
		vi.mocked(parseJwt).mockResolvedValue({ valid: true, payload } as never);
		const r = await verifyAuth0M2mBearer("Bearer good", issuer, audience);
		expect(r).toEqual({ ok: true, payload });
		expect(parseJwt).toHaveBeenCalledWith("good", issuer, audience);
	});
});
