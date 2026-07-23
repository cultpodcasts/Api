import { describe, expect, it } from "vitest";
import {
	bookmarksListResponseSchema,
	discoveryCurationResponseSchema,
	discoveryInfoResponseSchema,
	discoveryScheduleResponseSchema,
	discoverySubmitRequestSchema,
	discoverySubmitResponseSchema,
	episodeChangeRequestSchema,
	episodeDtoSchema,
	episodeListResponseSchema,
	episodePublishRequestSchema,
	episodeUpdateResponseSchema,
	errorSchema,
	flairsResponseSchema,
	homepageResponseSchema,
	languagesResponseSchema,
	pageDetailsResponseSchema,
	podcastChangeRequestSchema,
	podcastRenameRequestSchema,
	publicEpisodeDtoSchema,
	searchRequestSchema,
	searchResponseSchema,
	subjectChangeRequestSchema,
	subjectsNameListResponseSchema,
	submitUrlRequestSchema,
	submitUrlResponseSchema
} from "../src/openapiSchemas";

describe("openapi Zod schemas", () => {
	it("accepts discovery submit body matching Azure DiscoverySubmitRequest", () => {
		const parsed = discoverySubmitRequestSchema.parse({
			ids: ["550e8400-e29b-41d4-a716-446655440000"],
			resultIds: ["6ba7b810-9dad-11d1-80b4-00c04fd430c8"]
		});
		expect(parsed.ids).toHaveLength(1);
		expect(parsed.resultIds).toHaveLength(1);
	});

	it("accepts search and submit-url request shapes", () => {
		expect(searchRequestSchema.parse({ search: "cult", orderby: "release desc" }).search).toBe("cult");
		expect(submitUrlRequestSchema.parse({ url: "https://example.com/ep" }).url).toContain("example.com");
		expect(podcastRenameRequestSchema.parse({ newPodcastName: "New Name" }).newPodcastName).toBe("New Name");
	});

	it("rejects discovery submit without uuid arrays", () => {
		expect(() => discoverySubmitRequestSchema.parse({ ids: ["not-a-uuid"], resultIds: [] })).toThrow();
	});

	it("accepts discovery curation GET response matching DiscoveryResponse DTO", () => {
		const parsed = discoveryCurationResponseSchema.parse({
			ids: ["550e8400-e29b-41d4-a716-446655440000"],
			hiddenCount: 2,
			results: [{
				id: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
				episodeName: "Episode title",
				showName: "Show name",
				released: "2026-07-01T12:00:00Z",
				duration: "01:30:00",
				urls: { spotify: "https://open.spotify.com/episode/abc" },
				subjects: ["comedy"],
				discoverService: ["Spotify", "YouTube"],
				enrichedTimeFromApple: false,
				enrichedUrlFromSpotify: true,
				autoHidden: false,
				acceptProbability: 0.85,
				matchingPodcasts: [{ name: "Pod", visible: true, visibleEpisodes: 3 }]
			}]
		});
		expect(parsed.results).toHaveLength(1);
		expect(parsed.hiddenCount).toBe(2);
	});

	it("accepts discovery schedule response", () => {
		const parsed = discoveryScheduleResponseSchema.parse({
			runTimes: ["09:00"],
			timeZoneId: "Europe/London",
			enabled: true,
			isDefault: false,
			nextRuns: [{
				slotId: "slot-1",
				slotStartUtc: "2026-07-23T08:00:00Z",
				slotStartUk: "2026-07-23T09:00:00+01:00"
			}]
		});
		expect(parsed.nextRuns).toHaveLength(1);
	});

	it("accepts flairs map keyed by flair template uuid", () => {
		const parsed = flairsResponseSchema.parse({
			"550e8400-e29b-41d4-a716-446655440000": {
				text: "Discussion",
				textEditable: false,
				textColour: "#ffffff",
				backgroundColour: "#0079d3"
			}
		});
		expect(Object.keys(parsed)).toHaveLength(1);
	});

	it("accepts languages code-to-name map", () => {
		const parsed = languagesResponseSchema.parse({ en: "English", fr: "French" });
		expect(parsed.en).toBe("English");
	});

	it("accepts bookmarks list as episode uuid array", () => {
		const parsed = bookmarksListResponseSchema.parse([
			"550e8400-e29b-41d4-a716-446655440000",
			"6ba7b810-9dad-11d1-80b4-00c04fd430c8"
		]);
		expect(parsed).toHaveLength(2);
	});

	it("accepts error response with error or message", () => {
		expect(errorSchema.parse({ error: "Unauthorised" }).error).toBe("Unauthorised");
		expect(errorSchema.parse({ message: "Could not retrieve bookmarks" }).message).toContain("bookmarks");
	});

	it("accepts EpisodeDto shaped like Azure curate episode JSON", () => {
		const parsed = episodeDtoSchema.parse({
			id: "550e8400-e29b-41d4-a716-446655440000",
			podcastId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
			podcastName: "Show",
			title: "Ep",
			description: "Desc",
			release: "2026-07-01T12:00:00Z",
			duration: "01:30:00",
			explicit: false,
			posted: false,
			tweeted: false,
			bluesky: null,
			ignored: false,
			removed: false,
			urls: { spotify: "https://open.spotify.com/episode/x" },
			subjects: ["cult"]
		});
		expect(parsed.duration).toBe("01:30:00");
	});

	it("accepts outgoing episodes as EpisodeDto array", () => {
		const list = episodeListResponseSchema.parse([{
			id: "550e8400-e29b-41d4-a716-446655440000",
			podcastId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
			podcastName: "Show",
			title: "Ep",
			description: "Desc",
			release: "2026-07-01T12:00:00Z",
			duration: "00:45:00",
			explicit: false,
			posted: false,
			tweeted: false,
			ignored: false,
			removed: false,
			urls: {},
			subjects: []
		}]);
		expect(list).toHaveLength(1);
	});

	it("accepts EpisodeUpdateResponse 202 body", () => {
		const parsed = episodeUpdateResponseSchema.parse({
			tweetDeleted: true,
			blueskyPostDeleted: false,
			searchIndexerState: "Executed"
		});
		expect(parsed.searchIndexerState).toBe("Executed");
	});

	it("accepts PublicEpisodeDto", () => {
		const parsed = publicEpisodeDtoSchema.parse({
			id: "550e8400-e29b-41d4-a716-446655440000",
			podcastName: "Show",
			title: "Ep",
			description: "Desc",
			release: "2026-07-01T12:00:00Z",
			duration: "01:00:00",
			explicit: false,
			subjects: [],
			urls: {}
		});
		expect(parsed.title).toBe("Ep");
	});

	it("accepts DiscoverySubmitResponse", () => {
		const parsed = discoverySubmitResponseSchema.parse({
			message: "ok",
			errorsOccurred: false,
			results: [{
				discoveryItemId: "550e8400-e29b-41d4-a716-446655440000",
				podcastId: null,
				episodeId: null,
				message: "created"
			}],
			searchIndexerState: "Executed"
		});
		expect(parsed.results[0].message).toBe("created");
	});

	it("accepts SubmitUrlResponse success body", () => {
		const parsed = submitUrlResponseSchema.parse({
			success: {
				episode: "Created",
				podcast: "Enriched",
				episodeId: "550e8400-e29b-41d4-a716-446655440000",
				podcastId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
				episodeDetails: {
					spotify: true,
					apple: false,
					youtube: true,
					bbc: false,
					internetArchive: false,
					subjects: ["cult"]
				}
			}
		});
		expect(parsed.success?.episode).toBe("Created");
	});

	it("accepts R2 subjects name list, discovery-info, page details, and search envelope", () => {
		expect(subjectsNameListResponseSchema.parse([{ name: "cult" }])[0].name).toBe("cult");
		expect(discoveryInfoResponseSchema.parse({
			documentCount: 10,
			numberOfResults: 3,
			discoveryBegan: "2026-07-01T08:00:00Z"
		}).documentCount).toBe(10);
		expect(pageDetailsResponseSchema.parse({
			title: "Ep | Show",
			description: "Show",
			releaseDate: "01/07/2026",
			duration: "01:00:00"
		}).title).toContain("Show");
		expect(searchResponseSchema.parse({
			"@odata.count": 1,
			value: [{
				id: "550e8400-e29b-41d4-a716-446655440000",
				episodeTitle: "Ep",
				podcastName: "Show",
				episodeDescription: "Desc",
				release: "2026-07-01T12:00:00Z",
				duration: "01:00:00",
				subjects: ["cult"]
			}]
		}).value).toHaveLength(1);
	});

	it("accepts EpisodePublishRequest flags", () => {
		expect(episodePublishRequestSchema.parse({
			post: true,
			tweet: false,
			blueskyPost: true
		}).blueskyPost).toBe(true);
	});

	it("accepts EpisodeChangeRequest including empty URL clears matching Angular", () => {
		const parsed = episodeChangeRequestSchema.parse({
			title: "New title",
			bluesky: false,
			urls: {
				spotify: "https://open.spotify.com/episode/x",
				apple: "",
				youtube: null
			},
			images: { other: "" },
			guests: ["Alice"]
		});
		expect(parsed.urls?.apple).toBe("");
		expect(parsed.images?.other).toBe("");
	});

	it("accepts PodcastChangeRequest Service enum and SubjectChangeRequest SubjectType", () => {
		expect(podcastChangeRequestSchema.parse({
			releaseAuthority: "Spotify",
			primaryPostService: "YouTube",
			appleId: 123
		}).releaseAuthority).toBe("Spotify");
		expect(subjectChangeRequestSchema.parse({
			name: "Topic",
			subjectType: "Canonical"
		}).subjectType).toBe("Canonical");
		expect(() => podcastChangeRequestSchema.parse({ releaseAuthority: "Bbc" })).toThrow();
	});

	it("accepts homepage HomePageModel JSON", () => {
		const parsed = homepageResponseSchema.parse({
			recentEpisodes: [{
				id: "550e8400-e29b-41d4-a716-446655440000",
				episodeId: "550e8400-e29b-41d4-a716-446655440000",
				podcastName: "Show",
				episodeTitle: "Ep",
				episodeDescription: "Desc",
				duration: "01:00:00",
				release: "2026-07-01T12:00:00Z",
				spotify: "https://open.spotify.com/episode/x",
				subjects: ["cult"]
			}],
			episodeCount: 1,
			totalDuration: "01:00:00"
		});
		expect(parsed.recentEpisodes[0].podcastName).toBe("Show");
	});
});
