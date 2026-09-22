import { describe, expect, it } from "vitest";
import {
	parseCdnCgiTrace,
	traceMatchesExpectedPop
} from "../src/cdnCgiTrace";

const sample = `fl=1
h=cloudflare.com
colo=IAD
loc=US
`;

describe("parseCdnCgiTrace", () => {
	it("parses loc and colo", () => {
		expect(parseCdnCgiTrace(sample)).toEqual({
			raw: sample.trim(),
			loc: "US",
			colo: "IAD"
		});
	});
});

describe("traceMatchesExpectedPop", () => {
	const trace = parseCdnCgiTrace(sample);

	it("rejects missing expectedPop", () => {
		expect(traceMatchesExpectedPop(trace, null)).toBe(false);
		expect(traceMatchesExpectedPop(trace, {})).toBe(false);
	});

	it("matches loc allowlist", () => {
		expect(traceMatchesExpectedPop(trace, { locs: ["US"] })).toBe(true);
		expect(traceMatchesExpectedPop(trace, { locs: ["GB"] })).toBe(false);
	});

	it("matches colo allowlist", () => {
		expect(traceMatchesExpectedPop(trace, { colos: ["IAD", "EWR"] })).toBe(true);
		expect(traceMatchesExpectedPop(trace, { colos: ["LHR"] })).toBe(false);
	});

	it("requires both when both provided", () => {
		expect(traceMatchesExpectedPop(trace, { locs: ["US"], colos: ["IAD"] })).toBe(true);
		expect(traceMatchesExpectedPop(trace, { locs: ["US"], colos: ["LHR"] })).toBe(false);
	});
});
