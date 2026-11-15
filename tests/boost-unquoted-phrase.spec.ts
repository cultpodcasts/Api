import { describe, expect, it, vi, afterEach } from "vitest";

vi.mock("workers-og", () => ({ ImageResponse: class ImageResponse {} }));

import { Hono } from "hono";
import type { Env } from "../src/Env";
import type { ActionContext } from "../src/ActionContext";
import type { oDataSearchModel } from "../src/oDataSearchModel";
import {
	UNQUOTED_PHRASE_BOOST,
	boostUnquotedPhrase,
	boostUnquotedPhraseInSearchRequest
} from "../src/boostUnquotedPhrase";
import { search } from "../src/search";
import { testEnv } from "./honoTestApp";

/** RPP #1434: Faderhuset is found by its alternative title Father's House. */
const fathersHouse = "Father's House";
const goingClear =
	"Going Clear: Scientology and the Prison of Belief";

describe("boostUnquotedPhrase", () => {
	it("adds a boosted phrase clause so an unquoted search for Father's House ranks Faderhuset above term-only matches such as Potter's House", () => {
		const rewritten = boostUnquotedPhrase(fathersHouse);
		expect(rewritten).toBe(
			`"Father's House"^${UNQUOTED_PHRASE_BOOST} OR (Father's House)`
		);
		expect(rewritten).toContain(`"Father's House"^${UNQUOTED_PHRASE_BOOST}`);
		expect(rewritten).toContain("OR (Father's House)");
		expect(rewritten).not.toContain("Potter's House");
	});

	it("leaves a query the user already quoted unchanged, so typed quotes still work", () => {
		expect(boostUnquotedPhrase(`"Father's House"`)).toBe(`"Father's House"`);
	});

	it("leaves a single term unchanged", () => {
		expect(boostUnquotedPhrase("House")).toBe("House");
	});

	it("boosts Going Clear's long alternative title, escaping the colon in the terms clause", () => {
		expect(boostUnquotedPhrase(goingClear)).toBe(
			`"Going Clear: Scientology and the Prison of Belief"^${UNQUOTED_PHRASE_BOOST} OR (Going Clear\\: Scientology and the Prison of Belief)`
		);
	});

	it("does not rewrite star, empty, or operator queries", () => {
		expect(boostUnquotedPhrase("*")).toBe("*");
		expect(boostUnquotedPhrase("")).toBe("");
		expect(boostUnquotedPhrase("Father's House | Potter's House")).toBe(
			"Father's House | Potter's House"
		);
		expect(boostUnquotedPhrase("title:Faderhuset")).toBe("title:Faderhuset");
		expect(boostUnquotedPhrase("title:Father's House")).toBe("title:Father's House");
	});

	it("normalizes extra whitespace in the phrase and the terms", () => {
		expect(boostUnquotedPhrase("  Father's   House  ")).toBe(
			`"Father's House"^${UNQUOTED_PHRASE_BOOST} OR (Father's House)`
		);
	});
});

describe("boostUnquotedPhraseInSearchRequest", () => {
	it("sets queryType to full when it boosts an unquoted phrase, and leaves quoted queries on simple", () => {
		const unquoted: oDataSearchModel = {
			search: fathersHouse,
			queryType: "simple",
			searchMode: "any"
		};
		boostUnquotedPhraseInSearchRequest(unquoted);
		expect(unquoted.search).toBe(
			`"Father's House"^${UNQUOTED_PHRASE_BOOST} OR (Father's House)`
		);
		expect(unquoted.queryType).toBe("full");
		expect(unquoted.searchMode).toBe("any");

		const quoted: oDataSearchModel = {
			search: `"Father's House"`,
			queryType: "simple",
			searchMode: "any"
		};
		boostUnquotedPhraseInSearchRequest(quoted);
		expect(quoted.search).toBe(`"Father's House"`);
		expect(quoted.queryType).toBe("simple");
	});
});

describe("POST /search unquoted phrase boost", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("forwards a boosted phrase query for Father's House so Faderhuset ranks above Potter's House without the user typing quotes", async () => {
		const bodies: string[] = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (_url: unknown, init?: RequestInit) => {
				bodies.push(String(init?.body));
				return new Response(JSON.stringify({ value: [], "@odata.count": 0 }), {
					status: 200,
					headers: { "content-type": "application/json" }
				});
			})
		);
		const hono = new Hono<{ Bindings: Env }>();
		hono.post("/search", (c) => search(c as unknown as ActionContext));
		const resp = await hono.request(
			"/search",
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					search: fathersHouse,
					searchMode: "any",
					queryType: "simple"
				})
			},
			testEnv({
				apihost: "https://search.example/indexes/test/docs/search",
				apikey: "test-search-key",
				Data: { get: async () => null } as unknown as R2Bucket
			} as Partial<Env>)
		);
		expect(resp.status).toBe(200);
		expect(bodies).toHaveLength(1);
		const sent = JSON.parse(bodies[0]) as { search: string; queryType: string; searchMode: string };
		expect(sent.search).toBe(
			`"Father's House"^${UNQUOTED_PHRASE_BOOST} OR (Father's House)`
		);
		expect(sent.queryType).toBe("full");
		expect(sent.searchMode).toBe("any");
	});
});
