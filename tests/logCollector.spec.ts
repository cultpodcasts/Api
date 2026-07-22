import { describe, expect, it } from "vitest";
import { LogCollector } from "../src/LogCollector";

describe("LogCollector ASN", () => {
	it("records asn from add() without typo", () => {
		const collector = new LogCollector();
		collector.add({ asn: "12345" });
		expect(collector.toEndpointLog().request?.asn).toBe("12345");
	});
});
