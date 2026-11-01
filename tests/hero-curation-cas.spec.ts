import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HeroCurationDurableObject } from "../src/HeroCurationDurableObject";
import {
	canonicalUpdatedAt,
	HERO_KV_KEY,
	HeroCurationState,
	parseIsoInstant,
	updatedAtMatches
} from "../src/heroCurationLogic";

// Api #200 / RedditPodcastPoster #1212: hero CAS tokens compare as instants, and updatedAt is emitted as UTC `Z`.

const episodeA = "synthetic-episode-a";
const episodeB = "synthetic-episode-b";

function relativeInstant(hoursAgo: number): Date {
	const value = new Date(Date.now() - hoursAgo * 3_600_000);
	value.setUTCSeconds(0, 0);
	return value;
}

function plusOneHourOffset(instant: Date): string {
	const shifted = new Date(instant.getTime() + 3_600_000).toISOString().slice(0, 19);
	return `${shifted}+01:00`;
}

function durableObject(stored?: unknown, kv?: unknown) {
	const storage = new Map<string, unknown>();
	if (stored !== undefined) {
		storage.set("state", stored);
	}
	const kvReads: string[] = [];
	const ctx = {
		storage: {
			get: async (key: string) => storage.get(key),
			put: async (key: string, value: unknown) => {
				storage.set(key, value);
			}
		}
	};
	const env = {
		Curated: {
			get: async (key: string) => {
				kvReads.push(key);
				return kv ?? null;
			}
		}
	};
	const target = new HeroCurationDurableObject(ctx as never, env as never);
	Object.assign(target, { ctx, env });
	return { target, storage, kvReads };
}

describe("hero curation updatedAt instants (Api #200)", () => {
	// Run east of UTC so a host-local read cannot hide behind a UTC CI host (RPP #1193 / #1217 guard).
	const originalTz = process.env.TZ;
	beforeAll(() => {
		process.env.TZ = "Pacific/Auckland";
	});
	afterAll(() => {
		if (originalTz === undefined) {
			delete process.env.TZ;
		} else {
			process.env.TZ = originalTz;
		}
	});

	it("runs with a host zone east of UTC", () => {
		// Arrange
		const midWinterUtc = new Date(Date.UTC(2026, 6, 1, 0, 0, 0));

		// Act
		const offsetMinutes = midWinterUtc.getTimezoneOffset();

		// Assert
		expect(offsetMinutes).toBe(-720);
	});

	it("reads a zone-less ISO date-time as UTC and rejects non-ISO text, including lowercase t and z", () => {
		// Arrange
		const instant = relativeInstant(5);
		const zoneLess = instant.toISOString().slice(0, 19);
		const lowercaseT = zoneLess.replace("T", "t");
		const lowercaseZ = `${zoneLess}z`;

		// Act
		const parsed = parseIsoInstant(zoneLess);
		const rejected = [
			parseIsoInstant("not a date"),
			parseIsoInstant("12/01/2026"),
			parseIsoInstant(undefined),
			parseIsoInstant(lowercaseT),
			parseIsoInstant(lowercaseZ)
		];

		// Assert
		expect(parsed).toBe(instant.getTime());
		expect(rejected).toEqual([null, null, null, null, null]);
	});

	it("parses trailing-zero fractions exactly and rejects sub-millisecond instants", () => {
		// Arrange
		const instant = relativeInstant(11);
		const base = instant.toISOString().slice(0, 23);

		// Act
		const trailingZeros = parseIsoInstant(`${base}000Z`);
		const oneMicrosecondLater = parseIsoInstant(`${base}001Z`);

		// Assert
		expect(trailingZeros).toBe(instant.getTime());
		expect(oneMicrosecondLater).toBeNull();
	});

	it("canonicalises offset and second-precision tokens to toISOString UTC Z", () => {
		// Arrange
		const instant = relativeInstant(7);
		const secondPrecision = `${instant.toISOString().slice(0, 19)}Z`;

		// Act
		const fromOffset = canonicalUpdatedAt(plusOneHourOffset(instant));
		const fromSeconds = canonicalUpdatedAt(secondPrecision);
		const untouched = canonicalUpdatedAt("opaque-token");

		// Assert
		expect(fromOffset).toBe(instant.toISOString());
		expect(fromSeconds).toBe(instant.toISOString());
		expect(untouched).toBe("opaque-token");
	});

	it("matches the same instant across precision and offset, and not a different instant", () => {
		// Arrange
		const instant = relativeInstant(3);
		const current = instant.toISOString();

		// Act
		const withoutMillis = updatedAtMatches(`${current.slice(0, 19)}Z`, current);
		const withOffset = updatedAtMatches(plusOneHourOffset(instant), current);
		const oneSecondLater = updatedAtMatches(new Date(instant.getTime() + 1000).toISOString(), current);
		const oneMicrosecondLater = updatedAtMatches(`${current.slice(0, 23)}001Z`, current);
		const opaqueSelf = updatedAtMatches("opaque-token", "opaque-token");
		const opaqueOther = updatedAtMatches("opaque-token", current);

		// Assert
		expect(withoutMillis).toBe(true);
		expect(withOffset).toBe(true);
		expect(oneSecondLater).toBe(false);
		expect(oneMicrosecondLater).toBe(false);
		expect(opaqueSelf).toBe(true);
		expect(opaqueOther).toBe(false);
	});

	it("replace accepts a CAS token without milliseconds for the stored instant", async () => {
		// Arrange
		const instant = relativeInstant(2);
		const stored: HeroCurationState = {
			episodeIds: [episodeA],
			railSubjects: [],
			updatedAt: instant.toISOString()
		};
		const { target } = durableObject(stored);

		// Act
		const result = await target.replace({
			episodeIds: [episodeB],
			expectedUpdatedAt: `${instant.toISOString().slice(0, 19)}Z`
		});

		// Assert
		expect(result.ok).toBe(true);
		expect(result.state.episodeIds).toEqual([episodeB]);
	});

	it("DO-level: replace accepts a CAS token with an offset for the stored instant (HTTP input is Z-only)", async () => {
		// Arrange
		const instant = relativeInstant(4);
		const stored: HeroCurationState = {
			episodeIds: [episodeA],
			railSubjects: [],
			updatedAt: instant.toISOString()
		};
		const { target } = durableObject(stored);

		// Act
		const result = await target.replace({
			episodeIds: [episodeB],
			expectedUpdatedAt: plusOneHourOffset(instant)
		});

		// Assert
		expect(result.ok).toBe(true);
	});

	it("replace still returns a conflict for a different instant and keeps the stored state", async () => {
		// Arrange
		const instant = relativeInstant(6);
		const stored: HeroCurationState = {
			episodeIds: [episodeA],
			railSubjects: [],
			updatedAt: instant.toISOString()
		};
		const { target, storage } = durableObject(stored);

		// Act
		const result = await target.replace({
			episodeIds: [episodeB],
			expectedUpdatedAt: new Date(instant.getTime() - 60_000).toISOString()
		});

		// Assert
		expect(result.ok).toBe(false);
		expect((storage.get("state") as HeroCurationState).episodeIds).toEqual([episodeA]);
	});

	it("replace returns a conflict for a token one microsecond after the stored instant", async () => {
		// Arrange
		const instant = relativeInstant(12);
		const stored: HeroCurationState = {
			episodeIds: [episodeA],
			railSubjects: [],
			updatedAt: instant.toISOString()
		};
		const { target, storage } = durableObject(stored);

		// Act
		const result = await target.replace({
			episodeIds: [episodeB],
			expectedUpdatedAt: `${instant.toISOString().slice(0, 23)}001Z`
		});

		// Assert
		expect(result.ok).toBe(false);
		expect(storage.get("state")).toEqual(stored);
	});

	it("get emits a stored offset updatedAt as UTC Z without rewriting storage", async () => {
		// Arrange
		const instant = relativeInstant(8);
		const storedToken = plusOneHourOffset(instant);
		const { target } = durableObject({
			episodeIds: [episodeA],
			railSubjects: [],
			updatedAt: storedToken
		});

		// Act
		const state = await target.get();
		const roundTrip = await target.replace({ episodeIds: [episodeB], expectedUpdatedAt: state.updatedAt });

		// Assert
		expect(state.updatedAt).toBe(instant.toISOString());
		expect(roundTrip.ok).toBe(true);
	});

	it("get leaves stored state untouched on read", async () => {
		// Arrange
		const instant = relativeInstant(9);
		const storedToken = `${instant.toISOString().slice(0, 19)}Z`;
		const { target, storage } = durableObject({
			episodeIds: [episodeA],
			railSubjects: [],
			updatedAt: storedToken
		});

		// Act
		await target.get();

		// Assert
		expect((storage.get("state") as HeroCurationState).updatedAt).toBe(storedToken);
	});

	it("KV migration stores updatedAt as canonical UTC Z", async () => {
		// Arrange
		const instant = relativeInstant(10);
		const { target, storage, kvReads } = durableObject(undefined, {
			episodeIds: [episodeA],
			railSubjects: [],
			updatedAt: plusOneHourOffset(instant)
		});

		// Act
		const state = await target.get();

		// Assert
		expect(kvReads).toEqual([HERO_KV_KEY]);
		expect(state.updatedAt).toBe(instant.toISOString());
		expect((storage.get("state") as HeroCurationState).updatedAt).toBe(instant.toISOString());
	});

	it("KV migration replaces a non-ISO updatedAt with a fresh UTC Z instant", async () => {
		// Arrange
		const before = Date.now();
		const { target } = durableObject(undefined, {
			episodeIds: [episodeA],
			railSubjects: [],
			updatedAt: "not a date"
		});

		// Act
		const state = await target.get();

		// Assert
		expect(state.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
		expect(Date.parse(state.updatedAt)).toBeGreaterThanOrEqual(before);
	});
});
