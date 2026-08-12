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
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const collector = new LogCollector();
		collector.add({ route: "getPeople" });
		collector.addMessage("step-one");
		collector.add({ event: "people.r2_error" });
		expect(logSpy).not.toHaveBeenCalled();
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

	it("emit writes one structured log via console.log including traced messages", () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
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
			event: "people.azure_ok",
			outcome: "success",
			route: "getPeople",
			status: 200,
			messages: ["azure attempted", "people.r2_error"],
			request: { asn: "1" }
		});
		expect(logSpy).toHaveBeenCalledOnce();
		expect(logSpy).toHaveBeenCalledWith(payload);
	});

	it("emitError uses console.error once; a second terminal emit is a no-op", () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		const collector = new LogCollector();
		collector.emitError({ event: "people.forbidden", outcome: "forbidden", route: "getPeople" });
		collector.emit({ event: "people.r2_hit", outcome: "success" });

		expect(errorSpy).toHaveBeenCalledOnce();
		expect(logSpy).not.toHaveBeenCalled();
		expect(collector.hasFlushed()).toBe(true);
		expect(errorSpy.mock.calls[0][0]).toMatchObject({
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
	});
});
