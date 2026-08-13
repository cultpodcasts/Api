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
			message: "search error",
			errors: { unrecognisedSearchFilter: true, missingSearch: true }
		});
	});

	it("emitWarn uses console.warn for leech", () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		const collector = new searchLogCollector();
		const payload = collector.emitWarn({ leech: true });
		expect(warnSpy).toHaveBeenCalledOnce();
		expect(payload).toMatchObject({
			message: "search error",
			errors: { leech: true }
		});
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
