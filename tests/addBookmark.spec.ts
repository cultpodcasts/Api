import { afterEach, describe, expect, it, vi } from "vitest";
import { addBookmark } from "../src/addBookmark";
import { addBookmarkResponse } from "../src/addBookmarkResponse";
import type { Env } from "../src/Env";
import type { Auth0JwtPayload } from "../src/Auth0JwtPayload";
import { appWithAuthPayload, testEnv } from "./honoTestApp";

const episodeId = "550e8400-e29b-41d4-a716-446655440000";
const route = "/bookmark/:episodeId";

function profileEnv(result: addBookmarkResponse) {
	const stub = {
		addBookmark: vi.fn(async () => result)
	};
	return testEnv({
		PROFILE_DURABLE_OBJECT: {
			idFromName: () => ({ toString: () => "profile" }),
			get: () => stub
		} as unknown as Env["PROFILE_DURABLE_OBJECT"]
	});
}

function bookmarkApp(payload: Auth0JwtPayload | null) {
	return appWithAuthPayload(route, "put", addBookmark, payload);
}

describe("PUT /bookmark/:episodeId", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("returns 200 Success when the profile already has the bookmark", async () => {
		const app = bookmarkApp({ sub: "user" } as Auth0JwtPayload);
		const resp = await app.request(
			`/bookmark/${episodeId}`,
			{ method: "PUT" },
			profileEnv(addBookmarkResponse.duplicateUserBookmark)
		);

		expect(resp.status).toBe(200);
		expect(await resp.json()).toEqual({ message: "Success" });
	});

	it("returns 200 Success when the bookmark is created", async () => {
		const app = bookmarkApp({ sub: "user" } as Auth0JwtPayload);
		const resp = await app.request(
			`/bookmark/${episodeId}`,
			{ method: "PUT" },
			profileEnv(addBookmarkResponse.created)
		);

		expect(resp.status).toBe(200);
		expect(await resp.json()).toEqual({ message: "Success" });
	});

	it("returns 403 when the token is missing", async () => {
		const app = bookmarkApp(null);
		const resp = await app.request(`/bookmark/${episodeId}`, { method: "PUT" }, testEnv());

		expect(resp.status).toBe(403);
		expect(await resp.json()).toEqual({ error: "Unauthorised" });
	});
});
