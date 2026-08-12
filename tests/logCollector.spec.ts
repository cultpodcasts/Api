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

	it("emits structured event/outcome/route for Workers Logs filters", () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		const collector = new LogCollector();
		collector.add({ route: "getPeople", asn: "1" });

		const payload = collector.emit("log", {
			event: "people.r2_hit",
			outcome: "success",
			status: 200
		});

		expect(payload).toMatchObject({
			event: "people.r2_hit",
			outcome: "success",
			route: "getPeople",
			status: 200,
			request: { asn: "1" }
		});
		expect(logSpy).toHaveBeenCalledWith(payload);
	});

	it("emit error uses console.error", () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const collector = new LogCollector();
		collector.emit("error", { event: "people.forbidden", outcome: "forbidden", route: "getPeople" });
		expect(errorSpy).toHaveBeenCalledOnce();
	});
});
