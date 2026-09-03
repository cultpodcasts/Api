import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	azureSubmitBackendDenialStatus,
	canCallAzureSubmitBackend
} from "../src/submitAccess";
import { getPodcastByName } from "../src/getPodcastByName";
import { hasPermission } from "../src/hasPermission";
import { submit } from "../src/submit";
import { submitLookup } from "../src/submitLookup";
import {
	submitUrlLookupResponseSchema,
	submitUrlRequestSchema,
	submitUrlResponseSchema
} from "../src/openapiSchemas";
import { handlerApp, invokeRoute, jwtPayload, testEnv } from "./support/honoRoute";
import {
	submitUrlCases,
	submitUrlUrls,
	type SubmitUrlActor,
	type SubmitUrlHttpStep
} from "./fixtures/submit-url-contract";

const submissionsCreate = vi.hoisted(() => vi.fn());

vi.mock("@prisma/adapter-d1", () => ({
	PrismaD1: class {
		constructor(_db: unknown) {}
	}
}));

vi.mock("@prisma/client", () => {
	class PrismaClientKnownRequestError extends Error {
		code: string;
		constructor(message: string, info: { code: string }) {
			super(message);
			this.code = info.code;
		}
	}
	return {
		PrismaClient: class {
			submissions = { create: submissionsCreate };
		},
		Prisma: { PrismaClientKnownRequestError }
	};
});

const AZURE_SUBMIT = "https://azure.example/api/SubmitUrl";
const AZURE_PODCAST = "https://azure.example/api/podcast";

function azureJson(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" }
	});
}

function jwtForActor(actor: SubmitUrlActor) {
	if (actor === "anonymous") {
		return null;
	}
	if (actor === "member-submit") {
		return jwtPayload({ permissions: ["submit"] });
	}
	return jwtPayload({ permissions: ["curate"] });
}

function authHeaders(actor: SubmitUrlActor): Record<string, string> {
	if (actor === "anonymous") {
		return {};
	}
	if (actor === "member-submit") {
		return { Authorization: "Bearer member-token" };
	}
	return { Authorization: "Bearer curator-token" };
}

async function invokeStep(
	step: SubmitUrlHttpStep,
	actor: SubmitUrlActor,
	env: ReturnType<typeof testEnv>
) {
	const auth = jwtForActor(actor);
	const headers = {
		...authHeaders(actor),
		...(step.method === "POST" ? { "Content-Type": "application/json" } : {})
	};
	const url = `https://api.test${step.path}`;
	if (step.workerRoute === "lookup") {
		const app = handlerApp("get", "/submit/lookup", submitLookup, auth);
		return invokeRoute(app, url, { method: "GET", headers }, env);
	}
	if (step.workerRoute === "podcast") {
		const app = handlerApp("get", "/podcast/:name", getPodcastByName, auth);
		return invokeRoute(app, url, { method: "GET", headers }, env);
	}
	const app = handlerApp("post", "/submit", submit, auth);
	return invokeRoute(
		app,
		url,
		{
			method: "POST",
			headers,
			body: JSON.stringify(step.requestBody)
		},
		env
	);
}

describe("submit / lookup Azure vs D1 business rules", () => {
	const fetchMock = vi.fn();

	beforeEach(() => {
		submissionsCreate.mockReset();
		submissionsCreate.mockResolvedValue({ id: 1 });
		fetchMock.mockReset();
		vi.stubGlobal("fetch", fetchMock);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("maps Curator to the curate JWT permission; submit alone is not Curator", () => {
		expect(canCallAzureSubmitBackend(jwtPayload({ permissions: ["curate"] }))).toBe(true);
		expect(canCallAzureSubmitBackend(jwtPayload({ scope: "openid curate" }))).toBe(true);
		expect(canCallAzureSubmitBackend(jwtPayload({ permissions: ["submit"] }))).toBe(false);
		expect(canCallAzureSubmitBackend(jwtPayload({ scope: "submit" }))).toBe(false);
		expect(canCallAzureSubmitBackend(null)).toBe(false);
		expect(canCallAzureSubmitBackend(undefined)).toBe(false);
		expect(hasPermission(jwtPayload({ permissions: ["submit"] }), "curate")).toBe(false);
	});

	it("unsigned GET /submit/lookup is 401 and does not fetch Azure", async () => {
		expect(azureSubmitBackendDenialStatus(null)).toBe(401);
		const env = testEnv();
		const app = handlerApp("get", "/submit/lookup", submitLookup, null);
		const res = await invokeRoute(
			app,
			`https://api.test/submit/lookup?url=${encodeURIComponent(submitUrlUrls.general)}`,
			{ method: "GET" },
			env
		);
		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ error: "Unauthorised" });
		expect(fetchMock).not.toHaveBeenCalled();
		expect(submissionsCreate).not.toHaveBeenCalled();
	});

	it("signed-in submit-only GET /submit/lookup is 403 and does not fetch Azure", async () => {
		const member = jwtPayload({ permissions: ["submit"] });
		expect(azureSubmitBackendDenialStatus(member)).toBe(403);
		const env = testEnv();
		const app = handlerApp("get", "/submit/lookup", submitLookup, member);
		const res = await invokeRoute(
			app,
			`https://api.test/submit/lookup?url=${encodeURIComponent(submitUrlUrls.known)}`,
			{
				method: "GET",
				headers: { Authorization: "Bearer member-token" }
			},
			env
		);
		expect(res.status).toBe(403);
		expect(await res.json()).toEqual({ error: "Forbidden" });
		expect(fetchMock).not.toHaveBeenCalled();
		expect(submissionsCreate).not.toHaveBeenCalled();
	});

	it("Curator with curate only fetches Azure for lookup and POST", async () => {
		const curatorOnly = jwtPayload({ permissions: ["curate"] });
		const env = testEnv();
		fetchMock.mockResolvedValue(
			azureJson(200, { known: false, kind: "streaming", podcastName: "Extracted Show" })
		);

		const lookupApp = handlerApp("get", "/submit/lookup", submitLookup, curatorOnly);
		const lookupRes = await invokeRoute(
			lookupApp,
			`https://api.test/submit/lookup?url=${encodeURIComponent(submitUrlUrls.general)}`,
			{
				method: "GET",
				headers: { Authorization: "Bearer curator-token" }
			},
			env
		);
		expect(lookupRes.status).toBe(200);
		expect(await lookupRes.json()).toEqual({
			known: false,
			kind: "streaming",
			podcastName: "Extracted Show"
		});
		expect(fetchMock).toHaveBeenCalledOnce();
		expect(submissionsCreate).not.toHaveBeenCalled();

		fetchMock.mockReset();
		fetchMock.mockResolvedValue(azureJson(409, [
			"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
			"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
		]));
		const postApp = handlerApp("post", "/submit", submit, curatorOnly);
		const postRes = await invokeRoute(
			postApp,
			"https://api.test/submit",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: "Bearer curator-token"
				},
				body: JSON.stringify({ url: submitUrlUrls.general })
			},
			env
		);
		expect(fetchMock).toHaveBeenCalledOnce();
		expect(postRes.status).toBe(409);
		expect(submissionsCreate).not.toHaveBeenCalled();
	});

	it("lookup 200 and POST body shapes match Isolated SubmitUrl DTOs", () => {
		expect(submitUrlLookupResponseSchema.parse({
			known: true,
			podcastId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
			podcastName: "Stored Show",
			kind: "podcast-service"
		}).known).toBe(true);
		expect(submitUrlLookupResponseSchema.parse({
			known: false,
			kind: "streaming",
			podcastName: "Extracted Show"
		}).podcastName).toBe("Extracted Show");
		expect(submitUrlLookupResponseSchema.parse({
			known: false,
			ambiguous: true,
			podcastIds: [
				"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
				"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
			]
		}).ambiguous).toBe(true);
		expect(submitUrlRequestSchema.parse({ url: submitUrlUrls.general }).url).toContain("spotify.com");
		expect(submitUrlRequestSchema.parse({
			url: submitUrlUrls.netflix,
			podcastName: "Extracted Show"
		}).podcastName).toBe("Extracted Show");
		expect(submitUrlRequestSchema.parse({
			url: submitUrlUrls.vimeo,
			podcastId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
			podcastName: "Page Show"
		}).podcastId).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
		expect(submitUrlResponseSchema.parse({
			success: {
				episode: "Created",
				podcast: "Created",
				episodeId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
				podcastId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
			}
		}).success?.episode).toBe("Created");
	});

	for (const tourCase of submitUrlCases) {
		it(tourCase.rule, async () => {
			const env = testEnv();
			for (const step of tourCase.http) {
				submissionsCreate.mockClear();
				fetchMock.mockReset();
				if (step.backend === "azure") {
					fetchMock.mockResolvedValue(azureJson(step.responseStatus, step.responseBody));
				}

				const res = await invokeStep(step, tourCase.actor, env);
				expect(res.status).toBe(step.responseStatus);
				expect(await res.json()).toEqual(step.responseBody);
				if (step.xOrigin) {
					expect(res.headers.get("X-Origin")).toBe("true");
				} else {
					expect(res.headers.get("X-Origin")).toBeNull();
				}

				if (step.backend === "d1") {
					expect(fetchMock).not.toHaveBeenCalled();
					expect(submissionsCreate).toHaveBeenCalledOnce();
					expect(submissionsCreate.mock.calls[0][0].data.url).toBe(
						(step.requestBody as { url: string }).url
					);
				} else if (step.backend === "azure") {
					expect(fetchMock).toHaveBeenCalledOnce();
					expect(submissionsCreate).not.toHaveBeenCalled();
					const [azureUrl, init] = fetchMock.mock.calls[0];
					expect(init?.method).toBe(step.method);
					if (step.workerRoute === "lookup") {
						expect(String(azureUrl)).toBe(`${AZURE_SUBMIT}?url=${encodeURIComponent(tourCase.url)}`);
					} else if (step.workerRoute === "submit") {
						expect(String(azureUrl)).toBe(AZURE_SUBMIT);
						expect(init?.body).toBe(JSON.stringify(step.requestBody));
					} else {
						const key = decodeURIComponent(step.path.slice("/podcast/".length));
						expect(String(azureUrl)).toBe(`${AZURE_PODCAST}/${encodeURIComponent(key)}`);
					}
				} else {
					expect(fetchMock).not.toHaveBeenCalled();
					expect(submissionsCreate).not.toHaveBeenCalled();
				}
			}
		});
	}
});
