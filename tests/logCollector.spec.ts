import { afterEach, describe, expect, it, vi } from "vitest";
import { LogCollector } from "../src/LogCollector";

describe("LogCollector", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("records asn from add() without typo", () => {
		const collector = new LogCollector();
		collector.add({ asn: "12345" });
		expect(collector.toEndpointLog().request?.asn).toBe("12345");
	});

	it("add and addMessage accumulate without writing to console", () => {
		const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const collector = new LogCollector();
		collector.add({ route: "getPeople" });
		collector.addMessage("step-one");
		collector.add({ event: "people.r2_error" });
		expect(infoSpy).not.toHaveBeenCalled();
		expect(errorSpy).not.toHaveBeenCalled();
		expect(collector.toEndpointLog().messages).toEqual(["step-one"]);
	});

	it("replacing event mid-request breadcrumbs the previous event into messages", () => {
		const collector = new LogCollector();
		collector.add({ event: "people.r2_error" });
		collector.add({ event: "people.azure_non_200" });
		expect(collector.toEndpointLog()).toMatchObject({
			event: "people.azure_non_200",
			messages: ["people.r2_error"]
		});
	});

	it("emit writes one structured log via console.info including traced messages", () => {
		const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
		const collector = new LogCollector();
		collector.add({ route: "getPeople", asn: "1" });
		collector.add({ event: "people.r2_error" });
		collector.addMessage("azure attempted");

		const payload = collector.emit({
			event: "people.azure_ok",
			outcome: "success",
			status: 200
		});

		expect(payload).toMatchObject({
			message: "getPeople people.azure_ok success",
			event: "people.azure_ok",
			outcome: "success",
			route: "getPeople",
			status: 200,
			messages: ["azure attempted", "people.r2_error"],
			request: { asn: "1" }
		});
		expect(infoSpy).toHaveBeenCalledOnce();
		expect(infoSpy).toHaveBeenCalledWith(payload);
	});

	it("emit always sets message for Workers Logs Message column when omitted", () => {
		const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
		const collector = new LogCollector();
		collector.add({ route: "getBookmarks" });
		const payload = collector.emit({ event: "bookmarks.ok", outcome: "success" });

		expect(payload.message).toBe("getBookmarks bookmarks.ok success");
		expect(infoSpy.mock.calls[0][0]).toMatchObject({
			message: "getBookmarks bookmarks.ok success",
			event: "bookmarks.ok",
			route: "getBookmarks"
		});
	});

	it("emit keeps an explicit message over the derived primary message", () => {
		const collector = new LogCollector();
		collector.add({ route: "getBookmarks", message: "custom prose" });
		expect(collector.emit({ event: "bookmarks.ok", outcome: "success" }).message).toBe(
			"custom prose"
		);
	});

	it("addMessage breadcrumbs do not override primaryMessage from route/event/outcome", () => {
		const collector = new LogCollector();
		collector.add({ route: "addBookmark" });
		collector.addMessage("result= 1");
		const payload = collector.emit({ event: "bookmark.add_ok", outcome: "success" });
		expect(payload.message).toBe("addBookmark bookmark.add_ok success");
		expect(payload.messages).toEqual(["result= 1"]);
	});

	it("primaryMessage falls back to endpoint when no route/event/outcome", () => {
		expect(new LogCollector().primaryMessage()).toBe("endpoint");
	});

	it("emitError uses console.error once; a second terminal emit is a no-op", () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
		const collector = new LogCollector();
		collector.emitError({ event: "people.forbidden", outcome: "forbidden", route: "getPeople" });
		collector.emit({ event: "people.r2_hit", outcome: "success" });

		expect(errorSpy).toHaveBeenCalledOnce();
		expect(infoSpy).not.toHaveBeenCalled();
		expect(collector.hasFlushed()).toBe(true);
		expect(errorSpy.mock.calls[0][0]).toMatchObject({
			message: "getPeople people.forbidden forbidden",
			event: "people.forbidden",
			outcome: "forbidden",
			route: "getPeople"
		});
	});

	it("emitWarn uses console.warn", () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		const collector = new LogCollector();
		collector.emitWarn({ event: "discovery_info.not_found", outcome: "not_found" });
		expect(warnSpy).toHaveBeenCalledOnce();
		expect(warnSpy.mock.calls[0][0]).toMatchObject({
			message: "discovery_info.not_found not_found",
			event: "discovery_info.not_found"
		});
	});

	it("default emit level is info not log", () => {
		const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		new LogCollector().emit({ route: "getPeople", event: "people.ok", outcome: "success" });
		expect(infoSpy).toHaveBeenCalledOnce();
		expect(logSpy).not.toHaveBeenCalled();
	});
});
