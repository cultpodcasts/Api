import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../src/Env";
import {
	discoveryVoteRole,
	getDiscoveryCurationSession,
	postDiscoverySessionVote,
	upgradeDiscoveryCurationSessionWs
} from "../src/discoveryCurationSession";
import { submitDiscoveryOutcome } from "../src/submitDiscoveryOutcome";
import { allowAccessTokenQuery } from "../src/Auth0Middleware";
import {
	applyWsVoteIgnoringClientRole,
	emptyDiscoverySessionState,
	isProvisional,
	shouldClearPresenceOnClose,
	toClientSnapshot
} from "../src/discoveryCurationSessionLogic";
import {
	appWithAuthPayload,
	appWithPermissions,
	authJsonHeaders,
	testEnv
} from "./honoTestApp";
import type { Auth0JwtPayload } from "../src/Auth0JwtPayload";

vi.mock("../src/DiscoveryCurationDurableObject", () => ({
	discoveryCurationSessionStub: (env: Env) =>
		env.DISCOVERY_CURATION_DURABLE_OBJECT.get(
			env.DISCOVERY_CURATION_DURABLE_OBJECT.idFromName("global")
		)
}));

const emptySnap = {
	includedDocumentIds: [],
	pendingDocumentIds: [],
	selectedResultIds: [],
	votesByResultId: {},
	presence: {},
	rev: 0,
	updatedAt: "2026-01-01T00:00:00.000Z"
};

function sessionDo(overrides: { fetch?: ReturnType<typeof vi.fn> } = {}) {
	return {
		fetch: overrides.fetch ?? vi.fn(async () => Response.json(emptySnap))
	};
}

function envWithSession(stub: ReturnType<typeof sessionDo>): Env {
	return testEnv({
		DISCOVERY_CURATION_DURABLE_OBJECT: {
			idFromName: () => ({}),
			get: () => stub
		} as unknown as DurableObjectNamespace
	});
}

describe("discoveryVoteRole", () => {
	it("maps admin/supervise to supervise, curate:supervised, else curate", () => {
		expect(discoveryVoteRole({ permissions: ["admin"] } as Auth0JwtPayload)).toBe("supervise");
		expect(discoveryVoteRole({ permissions: ["supervise"] } as Auth0JwtPayload)).toBe(
			"supervise"
		);
		expect(
			discoveryVoteRole({ permissions: ["curate", "curate:supervised"] } as Auth0JwtPayload)
		).toBe("curate:supervised");
		expect(discoveryVoteRole({ permissions: ["curate"] } as Auth0JwtPayload)).toBe("curate");
		expect(discoveryVoteRole({ scope: "openid curate" } as Auth0JwtPayload)).toBe("curate");
	});
});

describe("allowAccessTokenQuery", () => {
	it("allows query token only for WS upgrade or discovery session WS path", () => {
		expect(
			allowAccessTokenQuery({
				upgradeHeader: "websocket",
				path: "/anything"
			})
		).toBe(true);
		expect(
			allowAccessTokenQuery({
				upgradeHeader: null,
				path: "/discovery-curation/session/ws"
			})
		).toBe(true);
		expect(
			allowAccessTokenQuery({
				upgradeHeader: null,
				path: "/discovery-curation/session"
			})
		).toBe(false);
		expect(
			allowAccessTokenQuery({
				upgradeHeader: "Bearer",
				path: "/hero-curation"
			})
		).toBe(false);
	});
});

describe("WS trusted role + multi-tab presence (logic)", () => {
	it("supervised WS vote stays provisional even when message claims supervise", () => {
		const trustedRole = "curate:supervised";
		const state = applyWsVoteIgnoringClientRole(
			emptyDiscoverySessionState(),
			"auth0|supervised",
			trustedRole,
			{ resultId: "r1", selected: true, role: "supervise" }
		);
		const votes = state.votesByResultId["r1"].votes;
		expect(votes[0].role).toBe("curate:supervised");
		expect(isProvisional(votes)).toBe(true);
		expect(toClientSnapshot(state).votesByResultId["r1"].provisional).toBe(true);
	});

	it("clears presence only when the last socket for a user closes", () => {
		expect(shouldClearPresenceOnClose("alice", ["alice"])).toBe(false);
		expect(shouldClearPresenceOnClose("alice", ["bob"])).toBe(true);
		expect(shouldClearPresenceOnClose("alice", [])).toBe(true);
	});
});

describe("discovery curation session handlers", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("GET session returns 401/403 without curate", async () => {
		const unauth = appWithAuthPayload(
			"/discovery-curation/session",
			"get",
			getDiscoveryCurationSession,
			null
		);
		const forbidden = appWithPermissions(
			"/discovery-curation/session",
			"get",
			getDiscoveryCurationSession,
			["submit"]
		);
		const env = envWithSession(sessionDo());

		expect(
			(await unauth.request("/discovery-curation/session", { method: "GET" }, env)).status
		).toBe(401);
		expect(
			(await forbidden.request("/discovery-curation/session", { method: "GET" }, env)).status
		).toBe(403);
	});

	it("GET session returns DO snapshot for curate", async () => {
		const stub = sessionDo();
		const app = appWithPermissions(
			"/discovery-curation/session",
			"get",
			getDiscoveryCurationSession,
			["curate"]
		);
		const resp = await app.request(
			"/discovery-curation/session",
			{ method: "GET", headers: authJsonHeaders },
			envWithSession(stub)
		);
		expect(resp.status).toBe(200);
		expect(await resp.json()).toEqual(emptySnap);
		expect(stub.fetch).toHaveBeenCalledWith("https://do/state");
	});

	it("POST vote derives role from JWT and posts to DO", async () => {
		const stub = sessionDo({
			fetch: vi.fn(async () => Response.json(emptySnap))
		});
		const app = appWithAuthPayload(
			"/discovery-curation/session/vote",
			"post",
			postDiscoverySessionVote,
			{
				sub: "auth0|alice",
				permissions: ["curate", "curate:supervised"]
			} as Auth0JwtPayload
		);
		const resp = await app.request(
			"/discovery-curation/session/vote",
			{
				method: "POST",
				headers: authJsonHeaders,
				body: JSON.stringify({
					resultId: "550e8400-e29b-41d4-a716-446655440000",
					selected: true
				})
			},
			envWithSession(stub)
		);
		expect(resp.status).toBe(200);
		expect(stub.fetch).toHaveBeenCalledWith(
			"https://do/vote",
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify({
					resultId: "550e8400-e29b-41d4-a716-446655440000",
					selected: true,
					userId: "auth0|alice",
					role: "curate:supervised"
				})
			})
		);
	});

	it("POST vote forwards DO 400 without success log", async () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const stub = sessionDo({
			fetch: vi.fn(async () =>
				Response.json({ error: "userId and resultId required" }, { status: 400 })
			)
		});
		const app = appWithPermissions(
			"/discovery-curation/session/vote",
			"post",
			postDiscoverySessionVote,
			["curate"]
		);
		const resp = await app.request(
			"/discovery-curation/session/vote",
			{
				method: "POST",
				headers: authJsonHeaders,
				body: JSON.stringify({
					resultId: "550e8400-e29b-41d4-a716-446655440000",
					selected: true
				})
			},
			envWithSession(stub)
		);
		expect(resp.status).toBe(400);
		expect(errorSpy.mock.calls.map((c) => c[0])).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ event: "discovery_session.vote_do_error" })
			])
		);
		expect(errorSpy.mock.calls.map((c) => c[0])).not.toEqual(
			expect.arrayContaining([
				expect.objectContaining({ event: "discovery_session.vote_ok" })
			])
		);
	});

	it("WS upgrade returns 426 without Upgrade: websocket", async () => {
		const stub = sessionDo();
		const app = appWithPermissions(
			"/discovery-curation/session/ws",
			"get",
			upgradeDiscoveryCurationSessionWs,
			["curate"]
		);
		const resp = await app.request(
			"/discovery-curation/session/ws",
			{ method: "GET", headers: authJsonHeaders },
			envWithSession(stub)
		);
		expect(resp.status).toBe(426);
		expect(stub.fetch).not.toHaveBeenCalled();
	});

	it("WS upgrade forwards trusted role header to DO", async () => {
		const stub = sessionDo({
			fetch: vi.fn(async () => new Response(null, { status: 101 }))
		});
		const app = appWithAuthPayload(
			"/discovery-curation/session/ws",
			"get",
			upgradeDiscoveryCurationSessionWs,
			{
				sub: "auth0|bob",
				permissions: ["curate", "curate:supervised"]
			} as Auth0JwtPayload
		);
		await app.request(
			"/discovery-curation/session/ws",
			{
				method: "GET",
				headers: { ...authJsonHeaders, Upgrade: "websocket" }
			},
			envWithSession(stub)
		);
		expect(stub.fetch).toHaveBeenCalledWith(
			"https://do/ws",
			expect.objectContaining({
				headers: expect.objectContaining({
					Upgrade: "websocket",
					"X-User-Id": "auth0|bob",
					"X-User-Role": "curate:supervised"
				})
			})
		);
	});

	it("submitDiscoveryOutcome proxies to Azure submit-outcome with curate", async () => {
		const fetchMock = vi.fn(
			async () => new Response(JSON.stringify({ items: [] }), { status: 200 })
		);
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithPermissions(
			"/discovery-curation/submit-outcome",
			"post",
			submitDiscoveryOutcome,
			["curate"]
		);
		const resp = await app.request(
			"/discovery-curation/submit-outcome",
			{
				method: "POST",
				headers: authJsonHeaders,
				body: JSON.stringify({ ids: [], resultIds: [] })
			},
			testEnv()
		);
		expect(resp.status).toBe(200);
		expect(fetchMock).toHaveBeenCalled();
		const calledUrl = String(fetchMock.mock.calls[0][0]);
		expect(calledUrl).toContain("/submit-outcome");
	});

	it("submitDiscoveryOutcome returns 403 without curate", async () => {
		const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);
		const app = appWithPermissions(
			"/discovery-curation/submit-outcome",
			"post",
			submitDiscoveryOutcome,
			["submit"]
		);
		const resp = await app.request(
			"/discovery-curation/submit-outcome",
			{
				method: "POST",
				headers: authJsonHeaders,
				body: JSON.stringify({ ids: [], resultIds: [] })
			},
			testEnv()
		);
		expect(resp.status).toBe(403);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
