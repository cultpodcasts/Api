import { afterEach, describe, expect, it, vi } from "vitest";
import { searchLogCollector } from "../src/searchLogCollector";
import { searchMode } from "../src/searchMode";

describe("searchLogCollector", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("records asn from add() without typo", () => {
		const collector = new searchLogCollector();
		collector.add({ asn: "12345" });
		expect(collector.toSearchLog().request?.asn).toBe("12345");
	});

	it("add and addMessage accumulate without writing to console", () => {
		const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const collector = new searchLogCollector();
		collector.add({ query: "cult", mode: searchMode.search });
		collector.addMessage("upstream fetched");
		expect(infoSpy).not.toHaveBeenCalled();
		expect(errorSpy).not.toHaveBeenCalled();
		expect(collector.toSearchLog().messages).toEqual(["upstream fetched"]);
	});

	it("replacing mode mid-request breadcrumbs the previous mode into messages", () => {
		const collector = new searchLogCollector();
		collector.add({ mode: searchMode.search });
		collector.add({ mode: searchMode.podcast, podcastName: "Example Show" });
		expect(collector.toSearchLog()).toMatchObject({
			query: { mode: "podcast", podcastName: "Example Show" },
			messages: ["search"]
		});
	});

	it("emit writes one structured search log via console.info with message", () => {
		const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
		const collector = new searchLogCollector();
		collector.add({ query: "cult", mode: searchMode.search, asn: "1" });
		collector.add({ results: 3 });
		collector.addMessage("parsed");

		const payload = collector.emit();

		expect(payload).toMatchObject({
			message: "search search cult 3",
			query: { mode: "search", query: "cult" },
			results: 3,
			messages: ["parsed"],
			request: { asn: "1" }
		});
		expect(infoSpy).toHaveBeenCalledOnce();
		expect(infoSpy).toHaveBeenCalledWith(payload);
	});

	it("emit keeps an explicit message over the derived primary message", () => {
		const collector = new searchLogCollector();
		collector.add({ query: "cult", mode: searchMode.search, message: "custom search prose" });
		expect(collector.emit().message).toBe("custom search prose");
	});

	it("emitError uses console.error once; a second terminal emit is a no-op", () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
		const collector = new searchLogCollector();
		collector.add({ unrecognisedSearchFilter: true, missingSearch: true });
		collector.emitError();
		collector.emit();

		expect(errorSpy).toHaveBeenCalledOnce();
		expect(infoSpy).not.toHaveBeenCalled();
		expect(collector.hasFlushed()).toBe(true);
		expect(errorSpy.mock.calls[0][0]).toMatchObject({
			message: "search missing_search",
			errors: { unrecognisedSearchFilter: true, missingSearch: true }
		});
	});

	it("emitWarn uses console.warn for leech", () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		const collector = new searchLogCollector();
		const payload = collector.emitWarn({ leech: true });
		expect(warnSpy).toHaveBeenCalledOnce();
		expect(payload).toMatchObject({
			message: "search leech",
			errors: { leech: true }
		});
	});

	it("primaryMessage distinguishes missing search and unrecognised filter", () => {
		const missing = new searchLogCollector();
		missing.add({ missingSearch: true, unrecognisedSearchFilter: true });
		expect(missing.primaryMessage()).toBe("search missing_search");

		const badFilter = new searchLogCollector();
		badFilter.add({ unrecognisedSearchFilter: true, filter: "weird" });
		expect(badFilter.primaryMessage()).toBe("search unrecognised_filter");
	});

	it("emitError with explicit message wins for bad_json paths", () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const collector = new searchLogCollector();
		collector.addMessage("bad_json");
		const payload = collector.emitError({ message: "search bad_json error" });
		expect(payload.message).toBe("search bad_json error");
		expect(payload.messages).toEqual(["bad_json"]);
		expect(errorSpy).toHaveBeenCalledOnce();
	});

	it("default emit level is info not log", () => {
		const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		new searchLogCollector().emit({ query: "x", mode: searchMode.search, results: 0 });
		expect(infoSpy).toHaveBeenCalledOnce();
		expect(logSpy).not.toHaveBeenCalled();
	});

	it("collectSearchRequest parses podcast and episode filters", () => {
		const podcast = new searchLogCollector();
		podcast.collectSearchRequest({ filter: "(podcastName eq 'Example Show')" });
		expect(podcast.toSearchLog().query).toMatchObject({
			mode: "podcast",
			podcastName: "Example Show"
		});

		const episode = new searchLogCollector();
		episode.collectSearchRequest({
			filter: "(podcastName eq 'Example Show') and (id eq 'abc-123')"
		});
		expect(episode.toSearchLog().query).toMatchObject({
			mode: "episode",
			episodeId: "abc-123"
		});
	});
});

describe("searchLogCollector compound subject & structured diagnostics (#319)", () => {
	it("extracts subject cleanly when followed by language or kind clauses", () => {
		const compound = new searchLogCollector();
		compound.collectSearchRequest({
			filter: "subjects/any(s: s eq 'Synanon') and (lang eq 'en' or lang eq null)"
		});
		expect(compound.toSearchLog().query).toMatchObject({
			mode: "subject",
			subject: "Synanon"
		});

		const escaped = new searchLogCollector();
		escaped.collectSearchRequest({
			filter: "subjects/any(s: s eq 'Heaven''s Gate') and contentKind ne 'Film'"
		});
		expect(escaped.toSearchLog().query).toMatchObject({
			mode: "subject",
			subject: "Heaven's Gate"
		});
	});

	it("includes route, engine, upstreamStatus, attempts, retryCount, durationMs and error cause", async () => {
		const { SearchEngine, SearchErrorClass, SearchRoute } = await import("../src/searchEngine");
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const collector = new searchLogCollector();
		const payload = collector.emitError({
			requestId: "ray-1",
			route: SearchRoute.Search,
			engine: SearchEngine.Azure,
			searchStatus: 502,
			upstreamStatus: 503,
			errorClass: SearchErrorClass.UpstreamHttpError,
			errorMessage: "ServiceUnavailable",
			attempts: 1,
			retryCount: 0,
			durationMs: 42
		});
		expect(payload).toMatchObject({
			requestId: "ray-1",
			route: "/search",
			engine: "azure",
			upstreamStatus: 503,
			attempts: 1,
			retryCount: 0,
			durationMs: 42,
			errors: {
				searchStatus: 502,
				upstreamStatus: 503,
				errorClass: "upstream_http_error",
				errorMessage: "ServiceUnavailable"
			}
		});
		expect(errorSpy).toHaveBeenCalledOnce();
	});
});
