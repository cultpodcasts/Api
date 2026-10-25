import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { Env } from "../src/Env";
import { testEnv } from "./honoTestApp";

vi.mock("@cfworker/jwt", () => ({
	parseJwt: vi.fn()
}));

import { parseJwt } from "@cfworker/jwt";
import { Auth0Middleware } from "../src/Auth0Middleware";

describe("Auth0Middleware query-token gating", () => {
	beforeEach(() => {
		vi.mocked(parseJwt).mockReset();
		vi.mocked(parseJwt).mockResolvedValue({
			valid: true,
			payload: { sub: "auth0|x", permissions: ["curate"] }
		} as never);
	});

	it("does not parse access_token query on non-WS routes", async () => {
		const app = new Hono<{ Bindings: Env }>();
		app.use("*", Auth0Middleware);
		app.get("/discovery-curation/session", (c) => {
			const payload = c.var.auth0("payload");
			return c.json({ hasAuth: Boolean(payload) });
		});

		const resp = await app.request(
			"/discovery-curation/session?access_token=leaky",
			{ method: "GET" },
			testEnv({
				auth0Issuer: "https://auth.example.com/",
				auth0Audience: "https://api.example.com/"
			})
		);
		expect(resp.status).toBe(200);
		expect(await resp.json()).toEqual({ hasAuth: false });
		expect(parseJwt).not.toHaveBeenCalled();
	});

	it("parses access_token query on discovery session WS path with Upgrade", async () => {
		const app = new Hono<{ Bindings: Env }>();
		app.use("*", Auth0Middleware);
		app.get("/discovery-curation/session/ws", (c) => {
			const payload = c.var.auth0("payload");
			return c.json({ sub: payload?.sub ?? null });
		});

		const resp = await app.request(
			"/discovery-curation/session/ws?access_token=ws-token",
			{ method: "GET", headers: { Upgrade: "websocket" } },
			testEnv({
				auth0Issuer: "https://auth.example.com/",
				auth0Audience: "https://api.example.com/"
			})
		);
		expect(resp.status).toBe(200);
		expect(await resp.json()).toEqual({ sub: "auth0|x" });
		expect(parseJwt).toHaveBeenCalledWith(
			"ws-token",
			"https://auth.example.com/",
			"https://api.example.com/"
		);
	});

	it("does not parse access_token when Upgrade is spoofed on an unrelated path", async () => {
		const app = new Hono<{ Bindings: Env }>();
		app.use("*", Auth0Middleware);
		app.get("/hero-curation", (c) => {
			const payload = c.var.auth0("payload");
			return c.json({ hasAuth: Boolean(payload) });
		});

		const resp = await app.request(
			"/hero-curation?access_token=leaky",
			{ method: "GET", headers: { Upgrade: "websocket" } },
			testEnv({
				auth0Issuer: "https://auth.example.com/",
				auth0Audience: "https://api.example.com/"
			})
		);
		expect(resp.status).toBe(200);
		expect(await resp.json()).toEqual({ hasAuth: false });
		expect(parseJwt).not.toHaveBeenCalled();
	});

	it("does not parse access_token on WS path without Upgrade header", async () => {
		const app = new Hono<{ Bindings: Env }>();
		app.use("*", Auth0Middleware);
		app.get("/discovery-curation/session/ws", (c) => {
			const payload = c.var.auth0("payload");
			return c.json({ hasAuth: Boolean(payload) });
		});

		const resp = await app.request(
			"/discovery-curation/session/ws?access_token=leaky",
			{ method: "GET" },
			testEnv({
				auth0Issuer: "https://auth.example.com/",
				auth0Audience: "https://api.example.com/"
			})
		);
		expect(resp.status).toBe(200);
		expect(await resp.json()).toEqual({ hasAuth: false });
		expect(parseJwt).not.toHaveBeenCalled();
	});
});
