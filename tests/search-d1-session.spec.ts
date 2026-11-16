import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import searchWorker from "../workers/search/src/index";
import { D1_READ_LOG, servedBy } from "../workers/search/src/d1-session";
import type { SearchEnv } from "../workers/search/src/env";
import { d1, d1Spy, migratedSearchDb, upsertSearchDoc } from "./support/searchD1";

/**
 * SP-1.2 (cultpodcasts/Api#220): every search read goes through the D1 Sessions API, so the
 * read replicas that `read_replication.mode = "auto"` creates can serve it, and each request
 * logs which region served it for the soak.
 */

const root = process.cwd();
const REPLICA_META = { served_by_region: "ENAM", served_by_primary: false, served_by_colo: "EWR", timings: { sql_duration_ms: 0.25 } };

function seededDb() {
	const db = migratedSearchDb();
	upsertSearchDoc(db, { id: "ep-1", title: "Scientology and the Sea Org", series_name: "Cult Talk" }, ["Scientology"]);
	upsertSearchDoc(db, { id: "ep-2", title: "Leaving Scientology", series_name: "Cult Talk", release: "2026-11-02T00:00:00Z" }, ["Scientology"]);
	return db;
}

const search = (env: SearchEnv, body: unknown) =>
	searchWorker.fetch(
		new Request("https://search.internal/indexes/cultpodcasts/docs/search", { method: "POST", body: JSON.stringify(body) }),
		env
	);
const health = (env: SearchEnv) => searchWorker.fetch(new Request("https://search.internal/health"), env);

describe("servedBy: D1 result meta summary", () => {
	it("reports a replica-served request", () => {
		expect(servedBy([{ meta: REPLICA_META }, { meta: REPLICA_META }])).toEqual({
			servedByRegion: "ENAM",
			servedByPrimary: false,
			servedByColo: "EWR",
			sqlDurationMs: 0.5,
			queries: 2
		});
	});

	it("lists distinct regions in query order and is primary only when every query was", () => {
		const summary = servedBy([
			{ meta: { served_by_region: "WEUR", served_by_primary: true } },
			{ meta: { served_by_region: "EEUR", served_by_primary: false } },
			{ meta: { served_by_region: "WEUR", served_by_primary: true } }
		]);
		expect(summary.servedByRegion).toBe("WEUR,EEUR");
		expect(summary.servedByPrimary).toBe(false);
		expect(servedBy([{ meta: { served_by_primary: true } }]).servedByPrimary).toBe(true);
	});

	it("is null, not a guess, when D1 gives no meta (local Miniflare, tests)", () => {
		expect(servedBy([{}, { meta: {} }])).toEqual({
			servedByRegion: null,
			servedByPrimary: null,
			servedByColo: null,
			sqlDurationMs: null,
			queries: 2
		});
	});
});

describe("Sessions API read path", () => {
	let log: MockInstance;
	beforeEach(() => {
		log = vi.spyOn(console, "log").mockImplementation(() => {});
	});
	afterEach(() => log.mockRestore());

	it("docs/search opens one first-unconstrained session per request and never reads around it", async () => {
		const spy = d1Spy();
		const env: SearchEnv = { SEARCH_DB: d1(seededDb(), { spy }) };
		// Page + count + facets in one batch, then the page's subject lookup: two round trips.
		const resp = await search(env, { search: "scientology", count: true, facets: ["subjects", "contentKind"] });
		expect(resp.status).toBe(200);
		const body = (await resp.json()) as { value: { subjects: string[] }[]; "@odata.count": number };
		expect(body["@odata.count"]).toBe(2);
		expect(body.value.every((d) => d.subjects.includes("Scientology"))).toBe(true);
		expect(spy.sessions).toEqual(["first-unconstrained"]);
		expect(spy.directPrepares).toEqual([]);

		await search(env, { search: "leaving" });
		expect(spy.sessions).toEqual(["first-unconstrained", "first-unconstrained"]);
	});

	it("docs/search logs where each request was served, once", async () => {
		const env: SearchEnv = { SEARCH_DB: d1(seededDb(), { meta: REPLICA_META }), searchEnvironment: "preview" };
		await search(env, { search: "scientology", count: true });
		expect(log).toHaveBeenCalledTimes(1);
		expect(log).toHaveBeenCalledWith(D1_READ_LOG, {
			route: "docs/search",
			environment: "preview",
			servedByRegion: "ENAM",
			servedByPrimary: false,
			servedByColo: "EWR",
			sqlDurationMs: 0.75,
			queries: 3
		});
	});

	it("docs/search does not log a read line for a 400 or a D1 failure", async () => {
		const quietError = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			const env: SearchEnv = { SEARCH_DB: d1(seededDb(), { meta: REPLICA_META }) };
			expect((await search(env, { filter: "seriesName eq" })).status).toBe(400);
			const { DatabaseSync } = await import("node:sqlite");
			expect((await search({ SEARCH_DB: d1(new DatabaseSync(":memory:")) }, { search: "x" })).status).toBe(503);
			expect(log).not.toHaveBeenCalled();
		} finally {
			quietError.mockRestore();
		}
	});

	it("health reads through a session and reports the region that answered", async () => {
		const spy = d1Spy();
		const env: SearchEnv = { SEARCH_DB: d1(migratedSearchDb(), { spy, meta: REPLICA_META }), searchEnvironment: "production" };
		const resp = await health(env);
		expect(resp.status).toBe(200);
		expect(await resp.json()).toMatchObject({ ok: true, servedByRegion: "ENAM", servedByPrimary: false });
		expect(spy.sessions).toEqual(["first-unconstrained"]);
		expect(spy.directPrepares).toEqual([]);
		// Probes return the region in the body; the soak log line is search traffic only.
		expect(log).not.toHaveBeenCalled();
	});

	it("no Worker source reads SEARCH_DB directly except the session helper", () => {
		const dir = resolve(root, "workers/search/src");
		for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts") && f !== "d1-session.ts")) {
			const src = readFileSync(resolve(dir, file), "utf8");
			expect(src, file).not.toMatch(/SEARCH_DB\s*\.\s*(prepare|batch|exec|dump)\b/);
		}
	});
});

describe("read replication is on for both search databases (Terraform)", () => {
	const moduleTf = ["main.tf", "variables.tf"].map((f) => readFileSync(resolve(root, "infra/terraform/modules/search-stack", f), "utf8")).join("\n");

	it("the module enables read_replication with mode auto by default", () => {
		expect(moduleTf).toMatch(/read_replication\s*=\s*\{\s*mode\s*=\s*var\.read_replication_mode\s*\}/);
		expect(moduleTf).toMatch(/variable "read_replication_mode"\s*\{[^}]*default\s*=\s*"auto"/);
	});

	it.each(["production", "preview"])("the %s root does not turn it off", (stack) => {
		const tf = readFileSync(resolve(root, "infra/terraform/search", stack, "main.tf"), "utf8");
		expect(tf).not.toMatch(/read_replication_mode\s*=/);
	});
});
