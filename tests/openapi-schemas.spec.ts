import { describe, expect, it } from "vitest";
import {
	bookmarksListResponseSchema,
	discoveryAwaitingReviewSchema,
	discoverySubmissionSummarySchema,
	searchSuggestionsResponseSchema,
	discoveryCurationResponseSchema,
	discoverySubmissionHeldResponseSchema,
	discoverySubmissionListResponseSchema,
	discoverySubmissionDetailResponseSchema,
	discoverySubmissionReviewRequestSchema,
	discoverySubmissionApplyRequestSchema,
	discoverySubmissionCommandResponseSchema,
	discoverySubmissionRetryRequestSchema,
	discoverySubmissionSetStateRequestSchema,
	discoveryErrorResponseSchema,
	discoverySubmissionReleaseRequestSchema,
	discoveryReportReleaseRequestSchema,
	discoveryReportReleaseResponseSchema,
	discoverySubmitConflictSchema,
	discoverySubmitBadRequestSchema,
	discoveryInfoResponseSchema,
	discoveryScheduleResponseSchema,
	discoverySubmitRequestSchema,
	discoverySubmitResponseSchema,
	episodeChangeRequestSchema,
	episodeDeleteBlockedSchema,
	episodeDtoSchema,
	episodeListResponseSchema,
	episodePublishRequestSchema,
	episodeUpdateResponseSchema,
	errorSchema,
	flairsResponseSchema,
	heroCurationResponseSchema,
	heroCurationUpdateRequestSchema,
	homepageResponseSchema,
	languagesResponseSchema,
	ogImageQuerySchema,
	pageDetailsResponseSchema,
	podcastChangeRequestSchema,
	podcastDtoSchema,
	podcastKindTransferRequestSchema,
	podcastKindTransferResponseSchema,
	podcastRenameRequestSchema,
	preProcessedHomepageResponseSchema,
	publicEpisodeDtoSchema,
	searchRequestSchema,
	searchResponseSchema,
	subjectChangeRequestSchema,
	subjectsNameListResponseSchema,
	submitUrlRequestSchema,
	submitUrlResponseSchema,
	catalogueIdentityLookupRequestSchema,
	catalogueIdentityLookupResponseSchema,
	filmChangeRequestSchema,
	filmDtoSchema,
	episodeFilmMoveRequestSchema,
	episodeFilmMoveResponseSchema,
	episodeTrailerAttachRequestSchema,
	episodeTrailerAttachResponseSchema,
	episodeTvShowMoveRequestSchema,
	episodeTvShowMoveResponseSchema,
	tvShowChangeRequestSchema,
	tvShowDtoSchema,
	tvShowEpisodeChangeRequestSchema,
	tvShowEpisodeDtoSchema,
	newsOrganisationChangeRequestSchema,
	newsOrganisationDtoSchema,
	newsReportChangeRequestSchema,
	newsReportDtoSchema,
	notFoundIdSchema
} from "../src/openapiSchemas";

describe("openapi Zod schemas", () => {
	it("accepts catalogue identity lookup request and matched/ambiguous responses", () => {
		const req = catalogueIdentityLookupRequestSchema.parse({
			kind: "TvShowEpisode",
			title: "Synthetic Episode",
			showName: "Synthetic Show",
			showTmdbId: 11,
			showTvdbId: 22,
			showImdbId: "tt0000001"
		});
		expect(req.kind).toBe("TvShowEpisode");
		expect(catalogueIdentityLookupResponseSchema.parse({
			status: "Matched",
			ids: { imdbId: "tt0000002", tmdbId: null, tvdbId: 99 },
			parentIds: { imdbId: "tt0000001", tmdbId: 11, tvdbId: 22 }
		}).status).toBe("Matched");
		expect(catalogueIdentityLookupResponseSchema.parse({
			status: "Ambiguous",
			identityDecision: {
				target: "Film",
				query: "Synthetic",
				candidates: [{
					key: "tmdb:1",
					title: "Synthetic",
					kind: "Film",
					source: "tmdb",
					tmdbId: 1,
					pageUrl: "https://www.themoviedb.org/movie/1",
					thumbnailUrl: "https://image.tmdb.org/t/p/w185/p.jpg",
					description: "Overview text"
				}]
			}
		}).identityDecision?.candidates[0].thumbnailUrl).toContain("w185");
		expect(catalogueIdentityLookupResponseSchema.parse({
			status: "Ambiguous",
			identityDecision: {
				target: "Film",
				query: "Synthetic",
				candidates: [{
					key: "tmdb:2",
					title: "Synthetic Alt",
					kind: "Film",
					source: "tmdb",
					pageUrl: "https://www.themoviedb.org/movie/2?language=en-US&include_adult=false",
					thumbnailUrl: null,
					description: null
				}]
			}
		}).identityDecision?.candidates[0].pageUrl).toContain("language=en-US");
	});

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
		expect(
			submitUrlRequestSchema.parse({
				url: "https://example.com/ep",
				podcastName: "Shared Show Name"
			}).podcastName
		).toBe("Shared Show Name");
		expect(
			submitUrlRequestSchema.parse({
				url: "https://example.com/ep",
				podcastId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
			}).podcastId
		).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
		expect(() => submitUrlRequestSchema.parse({})).toThrow();
		expect(() => submitUrlRequestSchema.parse({ podcastName: "Shared Show Name" })).toThrow();
		expect(() =>
			submitUrlRequestSchema.parse({ podcastId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" })
		).toThrow();
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
				subjectMatches: [{ subject: "comedy", term: "standup", source: "Description" }],
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
		expect(parsed.results[0].subjectMatches?.[0].term).toBe("standup");
	});

	it("accepts discovery subjectMatches null (historic) and [] (no matches), rejects unknown source", () => {
		const base = {
			id: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
			released: "2026-07-01T12:00:00Z",
			urls: {},
			subjects: [],
			discoverService: ["Spotify"],
			enrichedTimeFromApple: false,
			enrichedUrlFromSpotify: false,
			autoHidden: false
		};
		const parse = (subjectMatches: unknown) =>
			discoveryCurationResponseSchema.parse({ ids: [], hiddenCount: 0, results: [{ ...base, subjectMatches }] });
		expect(parse(null).results[0].subjectMatches).toBeNull();
		expect(parse([]).results[0].subjectMatches).toEqual([]);
		for (const source of ["Title", "Description", "PodcastDefault"]) {
			expect(parse([{ subject: "cult", term: "cult", source }]).results[0].subjectMatches?.[0].source).toBe(source);
		}
		expect(() => parse([{ subject: "cult", term: "cult", source: "title" }])).toThrow();
	});

	it("accepts discovery curation awaitingReview (DiscoveryAwaitingReviewDto)", () => {
		const parsed = discoveryCurationResponseSchema.parse({
			ids: [],
			hiddenCount: 0,
			results: [],
			awaitingReview: [{ id: "6ba7b810-9dad-11d1-80b4-00c04fd430c8", discoveryBegan: "2026-10-10T09:00:00Z", resultCount: 12 }]
		});
		expect(parsed.awaitingReview?.[0].resultCount).toBe(12);
		expect(() => discoveryCurationResponseSchema.parse({
			ids: [], hiddenCount: 0, results: [], awaitingReview: [{ id: "x", discoveryBegan: "2026-10-10T09:00:00Z", resultCount: 1 }]
		})).toThrow();
	});

	it("accepts discovery submit held 202 and 409 conflict bodies", () => {
		expect(discoverySubmissionHeldResponseSchema.parse({ submissionId: "550e8400-e29b-41d4-a716-446655440000", status: "Pending" }).status).toBe("Pending");
		expect(() => discoverySubmissionHeldResponseSchema.parse({ submissionId: "550e8400-e29b-41d4-a716-446655440000", status: "Applied" })).toThrow();
		expect(discoverySubmitConflictSchema.parse({ message: "busy", documentIds: ["6ba7b810-9dad-11d1-80b4-00c04fd430c8"] }).documentIds).toHaveLength(1);
		expect(discoverySubmitConflictSchema.parse({ message: "One or more reports are awaiting supervisor review." }).documentIds).toBeUndefined();
		expect(discoverySubmitBadRequestSchema.parse({ message: "bad ids", resultIds: ["6ba7b810-9dad-11d1-80b4-00c04fd430c8"] }).resultIds).toHaveLength(1);
	});

	it("accepts supervised discovery submission DTOs (RPP #1023)", () => {
		const id = "550e8400-e29b-41d4-a716-446655440000";
		const list = discoverySubmissionListResponseSchema.parse({
			view: "supervisor", pendingCount: 1,
			submissions: [{
				id, status: "Pending", submitterSubject: "auth0|a", submittedAt: "2026-10-11T09:00:00Z",
				discoveryResultsDocumentIds: [id], submitterAcceptedCount: 3, supervisorSubject: null,
				appliedAt: null, reportComment: null, itemCommentCount: 0, applyError: null
			}]
		});
		expect(list.submissions[0].status).toBe("Pending");
		expect(() => discoverySubmissionListResponseSchema.parse({ view: "other", pendingCount: 0, submissions: [] })).toThrow();

		const detail = discoverySubmissionDetailResponseSchema.parse({
			id, status: "Pending", etag: "\"abc\"", canReview: true, submitterSubject: "auth0|a",
			submittedAt: "2026-10-11T09:00:00Z", submitterAcceptedResultIds: [id],
			supervisorAcceptedResultIds: null, addedBySupervisorResultIds: null, removedBySupervisorResultIds: null,
			reportComment: null, itemComments: [{ resultId: id, comment: "why?" }],
			supervisorSubject: null, appliedAt: null, applyError: null, erroredResultIds: null,
			reports: [{
				id, discoveryBegan: "2026-10-10T09:00:00Z", state: "PendingSupervisor",
				results: [{
					id, released: "2026-07-01T12:00:00Z", urls: {}, subjects: [], discoverService: ["Spotify"],
					enrichedTimeFromApple: false, enrichedUrlFromSpotify: false, autoHidden: true
				}]
			}],
			history: [{ at: "2026-10-11T09:00:00Z", actorSubject: "auth0|a", action: "Submitted" }]
		});
		expect(detail.etag).toBe("\"abc\"");

		expect(discoverySubmissionReviewRequestSchema.parse({ etag: "e", reportComment: "", itemComments: [], acceptedResultIds: [id] }).etag).toBe("e");
		expect(() => discoverySubmissionReviewRequestSchema.parse({ reportComment: "x" })).toThrow();
		expect(discoverySubmissionApplyRequestSchema.parse({ etag: "e" }).acceptedResultIds).toBeUndefined();

		const applied = discoverySubmissionCommandResponseSchema.parse({
			submissionId: id, status: "Applied", etag: "e2", addedBySupervisorResultIds: [], removedBySupervisorResultIds: [],
			message: null, outcome: { message: "ok", errorsOccurred: false, results: [], searchIndexerState: "Executed" }
		});
		expect(applied.status).toBe("Applied");
	});

	it("accepts supervised discovery retry/release DTOs and item outcomes (RPP #1023 f9e1be1)", () => {
		const id = "550e8400-e29b-41d4-a716-446655440000";
		const itemOutcome = {
			resultId: id, state: "Failed", episodeId: null, podcastId: null, message: "Error",
			error: "HttpRequestException: 503", attempts: 2, lastAttemptAt: "2026-10-11T09:00:00Z"
		};
		const partial = discoverySubmissionCommandResponseSchema.parse({
			submissionId: id, status: "PartiallyApplied", etag: "e", ids: [id],
			outcome: { message: "ok", errorsOccurred: true, searchIndexerState: "Executed",
				results: [{ discoveryItemId: id, message: "Error", error: "HttpRequestException: 503" }] },
			itemOutcomes: [itemOutcome]
		});
		expect(partial.itemOutcomes?.[0].attempts).toBe(2);
		expect(partial.outcome?.results[0].error).toContain("503");
		expect(() => discoverySubmissionCommandResponseSchema.parse({ submissionId: id, status: "Rejected" })).toThrow();

		const summary = discoverySubmissionListResponseSchema.parse({
			view: "supervisor", pendingCount: 1,
			submissions: [{
				id, status: "Released", submitterSubject: "auth0|a", submittedAt: "2026-10-11T09:00:00Z",
				discoveryResultsDocumentIds: [id], submitterAcceptedCount: 1, itemCommentCount: 0,
				failedCount: null, succeededCount: null, abandonedCount: null,
				releasedAt: "2026-10-11T10:00:00Z", releaseReason: "stale"
			}]
		});
		expect(summary.submissions[0].releaseReason).toBe("stale");

		const detail = discoverySubmissionDetailResponseSchema.parse({
			id, status: "PartiallyApplied", etag: "e", canReview: true, submitterSubject: "auth0|a",
			submittedAt: "2026-10-11T09:00:00Z", submitterAcceptedResultIds: [id], itemComments: [],
			itemOutcomes: [itemOutcome, { ...itemOutcome, state: "Succeeded", error: null, episodeId: id, podcastId: id }],
			releasedAt: null, releaseReason: null, reports: [],
			history: ["RetryStarted", "ItemsAbandoned", "ReleaseStarted", "Released", "PartiallyApplied"].map((action) => ({ at: "2026-10-11T09:00:00Z", action }))
		});
		expect(detail.itemOutcomes).toHaveLength(2);

		expect(discoverySubmissionRetryRequestSchema.parse({ etag: "e", abandonResultIds: [id] }).abandonResultIds).toEqual([id]);
		expect(() => discoverySubmissionRetryRequestSchema.parse({ abandonResultIds: [] })).toThrow();
		expect(discoverySubmissionReleaseRequestSchema.parse({ etag: "e" }).reason).toBeUndefined();
		expect(discoveryReportReleaseRequestSchema.parse({}).reason).toBeUndefined();
		expect(discoveryReportReleaseResponseSchema.parse({ documentId: id, status: "Conflict", message: "held", submissionIds: [id] }).submissionIds).toHaveLength(1);
	});

	it("accepts Applying with inProgress fields, StateChanged history, set-state request and error DTOs (RPP #1023 5ea3cec)", () => {
		const id = "550e8400-e29b-41d4-a716-446655440000";
		const list = discoverySubmissionListResponseSchema.parse({
			view: "supervisor", pendingCount: 0,
			submissions: [{
				id, status: "Applying", submitterSubject: "auth0|a", submittedAt: "2026-10-11T09:00:00Z",
				discoveryResultsDocumentIds: [id], submitterAcceptedCount: 1, itemCommentCount: 0,
				inProgressOperation: "Retry", inProgressSince: "2026-10-11T09:05:00Z"
			}]
		});
		expect(list.submissions[0].inProgressOperation).toBe("Retry");
		const detail = discoverySubmissionDetailResponseSchema.parse({
			id, status: "Applying", etag: "e", canReview: false, submitterSubject: "auth0|a",
			submittedAt: "2026-10-11T09:00:00Z", submitterAcceptedResultIds: [], itemComments: [], reports: [],
			inProgressOperation: "Release", inProgressSince: "2026-10-11T09:05:00Z",
			history: [
				{ at: "2026-10-11T09:00:00Z", action: "Submitted", fromStatus: null, toStatus: null, reason: null },
				{ at: "2026-10-11T10:00:00Z", actorSubject: "auth0|admin", action: "StateChanged", fromStatus: "Applying", toStatus: "Pending", reason: "crashed" }
			]
		});
		expect(detail.inProgressOperation).toBe("Release");
		expect(() => discoverySubmissionDetailResponseSchema.parse({ ...detail, inProgressOperation: "Review" })).toThrow();
		expect(detail.history[1].toStatus).toBe("Pending");
		expect(() => discoverySubmissionDetailResponseSchema.parse({ ...detail, history: [{ at: "2026-10-11T10:00:00Z", action: "Recovered" }] })).toThrow();
		for (const status of ["Pending", "Applied", "ApplyFailed", "PartiallyApplied", "Released"]) {
			expect(discoverySubmissionSetStateRequestSchema.parse({ status, etag: "e" }).status).toBe(status);
		}
		expect(() => discoverySubmissionSetStateRequestSchema.parse({ status: "Applying", etag: "e" })).toThrow();
		expect(() => discoverySubmissionSetStateRequestSchema.parse({ status: "None", etag: "e" })).toThrow();
		expect(() => discoverySubmissionSetStateRequestSchema.parse({ status: "Pending" })).toThrow();
		expect(() => discoverySubmissionSetStateRequestSchema.parse({ status: "Pending", etag: "e", reason: "x".repeat(4001) })).toThrow();
		expect(discoveryErrorResponseSchema.parse({ message: "Missing subject." }).message).toBe("Missing subject.");
	});

	it("accepts discovery schedule response", () => {
		const parsed = discoveryScheduleResponseSchema.parse({
			runTimes: ["09:00"],
			timeZoneId: "Europe/London",
			enabled: true,
			isDefault: false,
			nextRuns: [{
				slotId: "2026-10-08 22:30 UK",
				slotStartUtc: "2026-10-08T21:30:00Z",
				slotStartUk: "2026-10-08T22:30:00+01:00"
			}, {
				slotId: "2026-12-08 22:30 UK",
				slotStartUtc: "2026-12-08T22:30:00Z",
				slotStartUk: "2026-12-08T22:30:00+00:00"
			}]
		});
		expect(parsed.nextRuns).toHaveLength(2);
		expect(parsed.nextRuns[1].slotStartUk).toBe("2026-12-08T22:30:00+00:00");
		expect(parsed.nextRuns[0].slotId).toBe("2026-10-08 22:30 UK");
		expect(parsed.nextRuns[0].slotStartUk).toBe("2026-10-08T22:30:00+01:00");
		expect(() => discoveryScheduleResponseSchema.parse({
			runTimes: ["09:00"],
			timeZoneId: "Europe/London",
			enabled: true,
			isDefault: false,
			nextRuns: [{
				slotId: "2026-10-08 22:30 UK",
				slotStartUtc: "string",
				slotStartUk: "2026-10-08T22:30:00+01:00"
			}]
		})).toThrow();
	});

	it("requires slotStartUtc in UTC with Z and lets only slotStartUk keep a local offset", () => {
		const schedule = (slotStartUtc: string, slotStartUk: string) => ({
			runTimes: ["22:30"],
			timeZoneId: "Europe/London",
			enabled: true,
			isDefault: false,
			nextRuns: [{ slotId: "2026-10-08 22:30 UK", slotStartUtc, slotStartUk }]
		});
		expect(() => discoveryScheduleResponseSchema.parse(schedule("2026-10-08T21:30:00+00:00", "2026-10-08T22:30:00+01:00"))).toThrow();
		expect(() => discoveryScheduleResponseSchema.parse(schedule("2026-10-08T22:30:00+01:00", "2026-10-08T22:30:00+01:00"))).toThrow();
		expect(() => discoveryScheduleResponseSchema.parse(schedule("2026-10-08T21:30:00", "2026-10-08T22:30:00+01:00"))).toThrow();
		expect(() => discoveryScheduleResponseSchema.parse(schedule("2026-10-08T21:30:00Z", "2026-10-08T22:30:00"))).toThrow();
		expect(discoveryScheduleResponseSchema.parse(schedule("2026-10-08T21:30:00.1234567Z", "2026-10-08T22:30:00.1234567+01:00")).nextRuns[0].slotStartUtc)
			.toBe("2026-10-08T21:30:00.1234567Z");
	});

	it("rejects Z for slotStartUk, because RPP writes the UK offset (+00:00 in GMT, +01:00 in BST) and never Z", () => {
		const schedule = (slotStartUk: string) => ({
			runTimes: ["09:00"],
			timeZoneId: "Europe/London",
			enabled: true,
			isDefault: false,
			nextRuns: [{ slotId: "slot-z", slotStartUtc: "2026-07-23T08:00:00Z", slotStartUk }]
		});
		expect(discoveryScheduleResponseSchema.safeParse(schedule("2026-07-23T09:00:00.000Z")).success).toBe(false);
		expect(discoveryScheduleResponseSchema.safeParse(schedule("2026-07-23T09:00:00z")).success).toBe(false);
		expect(discoveryScheduleResponseSchema.safeParse(schedule("2026-07-23T09:00:00.000+01:00")).success).toBe(true);
		expect(discoveryScheduleResponseSchema.safeParse(schedule("2026-12-01T08:00:00+00:00")).success).toBe(true);
	});

	describe.each([
		["episodeDtoSchema.release", episodeDtoSchema.shape.release],
		["discoverySubmissionSummarySchema.submittedAt", discoverySubmissionSummarySchema.shape.submittedAt],
		["discoverySubmissionSummarySchema.appliedAt", discoverySubmissionSummarySchema.shape.appliedAt],
		["discoveryAwaitingReviewSchema.discoveryBegan", discoveryAwaitingReviewSchema.shape.discoveryBegan],
		["searchSuggestionsResponseSchema.generatedAtUtc", searchSuggestionsResponseSchema.shape.generatedAtUtc]
	])("proxied RPP date-time %s", (_name, field) => {
		it("accepts a UTC instant ending in Z", () => {
			expect(field.safeParse("2026-10-08T21:30:00Z").success).toBe(true);
			expect(field.safeParse("2026-10-08T21:30:00.1234567Z").success).toBe(true);
		});

		it.each(["2026-10-08T21:30:00+00:00", "2026-10-08T22:30:00+01:00", "2026-10-08T21:30:00"])("rejects %s", (value) => {
			expect(field.safeParse(value).success).toBe(false);
		});
	});

	it("accepts only UTC Z instants for other API date-times", () => {
		expect(heroCurationResponseSchema.parse({ episodeIds: [], railSubjects: [], updatedAt: "2026-10-08T21:30:00.123Z" }).updatedAt)
			.toBe("2026-10-08T21:30:00.123Z");
		expect(() => heroCurationResponseSchema.parse({ episodeIds: [], railSubjects: [], updatedAt: "2026-10-08T22:30:00+01:00" })).toThrow();
		expect(() => heroCurationResponseSchema.parse({ episodeIds: [], railSubjects: [], updatedAt: "2026-10-08T21:30:00+00:00" })).toThrow();
		expect(() => heroCurationResponseSchema.parse({ episodeIds: [], railSubjects: [], updatedAt: "2026-10-08T21:30:00" })).toThrow();
		expect(heroCurationUpdateRequestSchema.safeParse({ railSubjects: [], expectedUpdatedAt: "2026-10-08T21:30:00Z" }).success).toBe(true);
		expect(heroCurationUpdateRequestSchema.safeParse({ railSubjects: [], expectedUpdatedAt: "2026-10-08T21:30:00+00:00" }).success).toBe(false);
	});

	it("accepts hero curation update request and response", () => {
		const request = heroCurationUpdateRequestSchema.parse({
			episodeIds: [
				"550e8400-e29b-41d4-a716-446655440000",
				"6ba7b810-9dad-11d1-80b4-00c04fd430c8"
			]
		});
		expect(request.episodeIds).toHaveLength(2);
		expect(heroCurationUpdateRequestSchema.parse({ episodeIds: [] }).episodeIds).toEqual([]);
		expect(() => heroCurationUpdateRequestSchema.parse({ episodeIds: ["not-a-uuid"] })).toThrow();
		expect(heroCurationResponseSchema.parse({
			episodeIds: ["550e8400-e29b-41d4-a716-446655440000"],
			railSubjects: ["Scientology"],
			updatedAt: "2026-07-25T12:00:00.000Z"
		}).updatedAt).toContain("2026");
		expect(heroCurationResponseSchema.parse({
			episodeIds: [],
			railSubjects: [],
			updatedAt: null
		}).updatedAt).toBeNull();
	});

	it("accepts rails-only and hero-only hero curation updates", () => {
		const railsOnly = heroCurationUpdateRequestSchema.parse({
			railSubjects: ["Scientology", "FLDS Church"]
		});
		expect(railsOnly.railSubjects).toHaveLength(2);
		expect(railsOnly.episodeIds).toBeUndefined();
		expect(heroCurationUpdateRequestSchema.parse({
			episodeIds: ["550e8400-e29b-41d4-a716-446655440000"]
		}).railSubjects).toBeUndefined();
		expect(() => heroCurationUpdateRequestSchema.parse({ railSubjects: [""] })).toThrow();
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
			subjects: ["cult"],
			hashTag: "#ScenarioTag",
			matches: [{ subject: "cult", term: "cult", source: "Title" }],
			guestSuggestions: [{
				person: { id: "550e8400-e29b-41d4-a716-446655440001", name: "Guest" },
				matchResults: [{ term: "Guest", matches: 2 }]
			}]
		});
		expect(parsed.duration).toBe("01:30:00");
		expect(parsed.hashTag).toBe("#ScenarioTag");
		expect(parsed.matches?.[0].term).toBe("cult");
		expect(parsed.guestSuggestions?.[0].matchResults[0].term).toBe("Guest");
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

	it("accepts EpisodeDto for a news report resolved by id, with additive kind fields", () => {
		const parsed = episodeDtoSchema.parse({
			id: "550e8400-e29b-41d4-a716-446655440000",
			podcastId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
			podcastName: "Synthetic Outlet",
			title: "Report",
			description: "Desc",
			release: "2026-07-01T00:00:00Z",
			duration: "00:04:00",
			explicit: false,
			posted: false,
			tweeted: false,
			ignored: false,
			removed: false,
			urls: {},
			subjects: [],
			contentKind: "NewsReport",
			parentId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
			parentName: "Synthetic Outlet",
			slug: "Synthetic Outlet",
			path: "/news/Synthetic%20Outlet/bgCEDlWb4tRBpxZEZlVEAAA"
		});
		expect(parsed.contentKind).toBe("NewsReport");
		expect(parsed.path).toContain("/news/");
	});

	it("accepts PublicEpisodeDto for a film without parent fields", () => {
		const parsed = publicEpisodeDtoSchema.parse({
			id: "550e8400-e29b-41d4-a716-446655440000",
			podcastName: "Synthetic Film",
			title: "Synthetic Film",
			description: "Desc",
			release: "2026-01-01T00:00:00Z",
			duration: "01:40:00",
			explicit: false,
			subjects: [],
			contentKind: "Film",
			slug: "Synthetic Film",
			path: "/film/Synthetic%20Film/ZgCEDlWb4tRBpxZEZlVEAAA"
		});
		expect(parsed.contentKind).toBe("Film");
		expect(parsed.parentId).toBeUndefined();
	});

	it("rejects an unknown contentKind on PublicEpisodeDto", () => {
		expect(() => publicEpisodeDtoSchema.parse({
			id: "550e8400-e29b-41d4-a716-446655440000",
			podcastName: "Show",
			title: "Ep",
			description: "Desc",
			release: "2026-07-01T12:00:00Z",
			duration: "01:00:00",
			explicit: false,
			subjects: [],
			contentKind: "Movie"
		})).toThrow();
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
					extraServiceKeys: ["vimeo"],
					subjects: ["cult"],
					people: [],
					guestSuggestions: [{
						name: "Guest",
						matchResults: [{ term: "Guest", matches: 1 }]
					}]
				}
			}
		});
		expect(parsed.success?.episode).toBe("Created");
		expect(parsed.success?.contentKind).toBeUndefined();
		expect(parsed.success?.playableId).toBeUndefined();
		expect(parsed.success?.episodeDetails?.extraServiceKeys).toEqual(["vimeo"]);
		expect(parsed.success?.episodeDetails?.people).toEqual([]);
		expect(parsed.success?.episodeDetails?.guestSuggestions?.[0].matchResults[0].term).toBe("Guest");
	});

	it("accepts SubmitUrlResponse catalogue contentKind and playableId without podcast ids", () => {
		const playableId = "550e8400-e29b-41d4-a716-446655440000";
		for (const contentKind of ["Episode", "TvShowEpisode", "Film", "NewsReport"] as const) {
			const parsed = submitUrlResponseSchema.parse({
				success: {
					episode: "Created",
					podcast: "Created",
					episodeId: null,
					podcastId: null,
					contentKind,
					playableId
				}
			});
			expect(parsed.success?.contentKind).toBe(contentKind);
			expect(parsed.success?.playableId).toBe(playableId);
			expect(parsed.success?.episodeId).toBeNull();
			expect(parsed.success?.podcastId).toBeNull();
		}
	});

	it("rejects SubmitUrlResponse invalid contentKind and non-UUID playableId", () => {
		const envelope = (success: Record<string, unknown>) => ({
			success: {
				episode: "Created",
				podcast: "Created",
				episodeId: null,
				podcastId: null,
				...success
			}
		});
		expect(() => submitUrlResponseSchema.parse(envelope({ contentKind: "Movie" }))).toThrow();
		expect(() => submitUrlResponseSchema.parse(envelope({ playableId: "not-a-uuid" }))).toThrow();
	});

	it("accepts SubmitUrlResponse extraServiceKeys omit, null, empty array, and bbcIplayer", () => {
		const platforms = { spotify: true, apple: false, youtube: true };
		const envelope = (episodeDetails: Record<string, unknown>) => ({
			success: {
				episode: "Created",
				podcast: "Enriched",
				episodeDetails
			}
		});

		expect(submitUrlResponseSchema.parse(envelope(platforms)).success?.episodeDetails?.extraServiceKeys)
			.toBeUndefined();
		expect(submitUrlResponseSchema.parse(envelope({ ...platforms, extraServiceKeys: null }))
			.success?.episodeDetails?.extraServiceKeys).toBeNull();
		expect(submitUrlResponseSchema.parse(envelope({ ...platforms, extraServiceKeys: [] }))
			.success?.episodeDetails?.extraServiceKeys).toEqual([]);
		expect(submitUrlResponseSchema.parse(envelope({ ...platforms, extraServiceKeys: ["bbcIplayer"] }))
			.success?.episodeDetails?.extraServiceKeys).toEqual(["bbcIplayer"]);
	});

	it("accepts SubmitUrlResponse leftover bbc and internetArchive episodeDetails bools", () => {
		const parsed = submitUrlResponseSchema.parse({
			success: {
				episode: "Created",
				podcast: "Enriched",
				episodeDetails: {
					spotify: false,
					apple: false,
					youtube: false,
					bbc: false,
					internetArchive: false
				}
			}
		});
		expect(parsed.success?.episodeDetails?.spotify).toBe(false);
		expect(parsed.success?.episodeDetails).not.toHaveProperty("bbc");
		expect(parsed.success?.episodeDetails).not.toHaveProperty("internetArchive");
	});

	it("rejects SubmitUrlResponse extraServiceKeys unknown catalog keys", () => {
		const envelope = (extraServiceKeys: string[]) => ({
			success: {
				episode: "Created",
				podcast: "Enriched",
				episodeDetails: {
					spotify: true,
					apple: false,
					youtube: true,
					extraServiceKeys
				}
			}
		});
		expect(() => submitUrlResponseSchema.parse(envelope(["notARealStreamer"]))).toThrow();
		expect(() => submitUrlResponseSchema.parse(envelope(["bbc"]))).toThrow();
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
			duration: "01:00:00",
			image: "https://i.scdn.co/image/ab6765cover",
			imageAspect: "square"
		}).imageAspect).toBe("square");
		expect(ogImageQuerySchema.parse({
			u: "https://i.ytimg.com/vi/sample/hqdefault.jpg",
			a: "wide",
			t: "Episode title",
			p: "Show name",
			d: "51 min",
			r: "24 Aug 2026",
			pl: "youtube,spotify,apple"
		}).a).toBe("wide");
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

	
	it("accepts tweeted-only episodeDeleteBlockedSchema without posted", () => {
		const parsed = episodeDeleteBlockedSchema.parse({
			message: "Cannot delete a tweeted episode",
			tweeted: true
		});
		expect(parsed.tweeted).toBe(true);
		expect(parsed).not.toHaveProperty("posted");
		expect(() => episodeDeleteBlockedSchema.parse({ posted: true, tweeted: true })).not.toThrow();
		const stripped = episodeDeleteBlockedSchema.parse({ posted: true, tweeted: true });
		expect(stripped.tweeted).toBe(true);
		expect((stripped as { posted?: boolean }).posted).toBeUndefined();
	});

	it("accepts EpisodeChangeRequest including empty URL clears matching Angular", () => {
		const parsed = episodeChangeRequestSchema.parse({
			title: "New title",
			unBluesky: true,
			hashTag: "#Scenario",
			urls: {
				ids: { spotify: "x" },
				services: { spotify: { url: "https://open.spotify.com/episode/x" } },
				spotify: "https://open.spotify.com/episode/x",
				apple: "",
				youtube: null
			},
			images: { other: "" },
			guests: ["Alice"]
		});
		expect(parsed.unBluesky).toBe(true);
		expect(parsed.hashTag).toBe("#Scenario");
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
				subjects: ["cult"],
				language: "fr-FR"
			}],
			episodeCount: 1,
			totalDuration: "01:00:00"
		});
		expect(parsed.recentEpisodes[0].podcastName).toBe("Show");
		expect(parsed.recentEpisodes[0].language).toBe("fr-FR");
	});

	it("accepts homepage recentEpisodes with contentKind NewsReport, TvShowEpisode and Film, and omitted for podcast episodes", () => {
		const row = (contentKind?: string) => ({
			id: "550e8400-e29b-41d4-a716-446655440000",
			podcastName: "Synthetic Parent",
			episodeTitle: "Synthetic item",
			episodeDescription: "Desc",
			duration: "00:05:00",
			release: "2026-10-21T00:00:00Z",
			...(contentKind ? { contentKind } : {})
		});
		const parsed = homepageResponseSchema.parse({
			recentEpisodes: [row("NewsReport"), row("TvShowEpisode"), row("Film"), row()],
			episodeCount: 4,
			totalDuration: "00:20:00"
		});
		expect(parsed.recentEpisodes.map((x) => x.contentKind)).toEqual([
			"NewsReport",
			"TvShowEpisode",
			"Film",
			undefined
		]);
		expect(() =>
			homepageResponseSchema.parse({ recentEpisodes: [row("Movie")], episodeCount: 1, totalDuration: "00:05:00" })
		).toThrow();
	});

	it("accepts homepage episode JSON without language (English/omitted)", () => {
		const parsed = homepageResponseSchema.parse({
			recentEpisodes: [{
				id: "550e8400-e29b-41d4-a716-446655440000",
				episodeId: "550e8400-e29b-41d4-a716-446655440000",
				podcastName: "Show",
				episodeTitle: "Ep",
				episodeDescription: "Desc",
				duration: "01:00:00",
				release: "2026-07-01T12:00:00Z"
			}],
			episodeCount: 1,
			totalDuration: "01:00:00"
		});
		expect(parsed.recentEpisodes[0].language).toBeUndefined();
	});

	it("accepts podcast kind transfer TvShow and NewsOrganisation and rejects Film Movie 0 and omitted targetKind", () => {
		expect(podcastKindTransferRequestSchema.parse({ targetKind: "TvShow" }).targetKind).toBe("TvShow");
		expect(podcastKindTransferRequestSchema.parse({ targetKind: "NewsOrganisation" }).targetKind).toBe(
			"NewsOrganisation"
		);
		expect(() => podcastKindTransferRequestSchema.parse({ targetKind: "Film" })).toThrow();
		expect(() => podcastKindTransferRequestSchema.parse({ targetKind: "Movie" })).toThrow();
		expect(() => podcastKindTransferRequestSchema.parse({ targetKind: 0 })).toThrow();
		expect(() => podcastKindTransferRequestSchema.parse({})).toThrow();
	});

	it("accepts 202 podcast kind transfer body with uuid parentId, int playableCount, bool failureIndexingPlayables", () => {
		const parsed = podcastKindTransferResponseSchema.parse({
			parentId: "550e8400-e29b-41d4-a716-446655440000",
			targetKind: "TvShow",
			playableCount: 3,
			failureIndexingPlayables: false
		});
		expect(parsed.parentId).toBe("550e8400-e29b-41d4-a716-446655440000");
		expect(parsed.playableCount).toBe(3);
		expect(parsed.failureIndexingPlayables).toBe(false);
		const news = podcastKindTransferResponseSchema.parse({
			parentId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
			targetKind: "NewsOrganisation",
			playableCount: 0,
			failureIndexingPlayables: true
		});
		expect(news.parentId).toBe("6ba7b810-9dad-11d1-80b4-00c04fd430c8");
		expect(news.playableCount).toBe(0);
		expect(news.failureIndexingPlayables).toBe(true);
	});

	it("accepts PreProcessedHomePageModel for homepage-ssr JSON", () => {
		const parsed = preProcessedHomepageResponseSchema.parse({
			totalDurationDays: 2200,
			episodesByDay: {
				"Friday 3 July": [{
					id: "550e8400-e29b-41d4-a716-446655440000",
					episodeId: "550e8400-e29b-41d4-a716-446655440000",
					podcastName: "Show",
					episodeTitle: "Ep",
					episodeDescription: "Desc",
					duration: "01:00:00",
					release: "2026-07-03T12:00:00Z"
				}]
			},
			hasNext: false,
			episodesThisWeek: 1,
			episodeCount: 100
		});
		expect(parsed.totalDurationDays).toBe(2200);
		expect(Object.keys(parsed.episodesByDay)).toHaveLength(1);
	});

	it("accepts film/TV/episode GET DTOs with nullable https identity URIs", () => {
		const film = filmDtoSchema.parse({
			id: "550e8400-e29b-41d4-a716-446655440000",
			name: "Catalogue Film Title",
			imdb: "https://www.imdb.com/title/tt0111161/"
		});
		expect(film.name).toBe("Catalogue Film Title");
		expect(
			tvShowDtoSchema.parse({
				id: "550e8400-e29b-41d4-a716-446655440000",
				name: "Catalogue Show Title",
				imdb: null,
				tvdb: "https://thetvdb.com/series/123"
			}).tvdb
		).toContain("thetvdb.com");
		const episode = tvShowEpisodeDtoSchema.parse({
			id: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
			tvShowId: "550e8400-e29b-41d4-a716-446655440000",
			title: "Episode Title",
			imdb: null,
			tvdb: null
		});
		expect(episode.title).toBe("Episode Title");
		expect(episode.tvShowId).toBe("550e8400-e29b-41d4-a716-446655440000");
	});

	it("parses film trailers, ids and links on the film DTO, PATCH body and search hit (synthetic)", () => {
		const trailerId = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
		const film = filmDtoSchema.parse({
			id: "550e8400-e29b-41d4-a716-446655440000",
			name: "Synthetic Film Title",
			imdbId: "tt0000003",
			tmdbId: 7,
			trailers: [{
				id: trailerId,
				title: "Synthetic Teaser",
				url: "https://www.youtube.com/watch?v=synthetic01",
				release: "2026-01-02T03:04:05Z",
				duration: "0:02:11"
			}]
		});
		expect(film.trailers?.[0]?.id).toBe(trailerId);

		const change = filmChangeRequestSchema.parse({
			imdbId: "",
			tmdbId: 0,
			services: { youtube: { url: "" }, bbcIplayer: { url: "https://www.bbc.co.uk/iplayer/episode/synthetic" } },
			trailers: [{ id: trailerId, title: "Synthetic Renamed Teaser" }]
		});
		expect(change.services?.youtube?.url).toBe("");
		expect(change.trailers).toHaveLength(1);
		expect(filmChangeRequestSchema.parse({
			trailers: [{ id: trailerId }],
			expectedTrailerIds: [trailerId]
		}).expectedTrailerIds).toEqual([trailerId]);
		expect(() => filmChangeRequestSchema.parse({ trailers: [{ id: "not-a-guid" }] })).toThrow();
		expect(() => filmChangeRequestSchema.parse({ expectedTrailerIds: ["not-a-guid"] })).toThrow();

		const hit = searchResponseSchema.parse({
			value: [{
				id: "550e8400-e29b-41d4-a716-446655440000",
				episodeTitle: "",
				podcastName: "",
				episodeDescription: "",
				release: "2026-01-02T03:04:05Z",
				duration: "1:30:00",
				contentKind: "Film",
				trailers: ["00:02:11|https://www.youtube.com/watch?v=synthetic01|Synthetic | Teaser"]
			}]
		});
		expect(hit.value[0]?.trailers).toHaveLength(1);
	});

	it("parses the attach-as-trailer request and command outcome and requires a film id", () => {
		const filmId = "550e8400-e29b-41d4-a716-446655440000";
		expect(episodeTrailerAttachRequestSchema.parse({ filmId, title: null }).filmId).toBe(filmId);
		expect(() => episodeTrailerAttachRequestSchema.parse({ title: "Synthetic Teaser" })).toThrow();
		expect(episodeTrailerAttachResponseSchema.parse({ filmId, name: "Synthetic Film Title", failureIndexing: false }).name)
			.toBe("Synthetic Film Title");
	});

	it("parses the move-to-TV-show request and command outcome", () => {
		const tvShowId = "550e8400-e29b-41d4-a716-446655440000";
		expect(episodeTvShowMoveRequestSchema.parse({ tvShowId }).tvShowId).toBe(tvShowId);
		expect(episodeTvShowMoveRequestSchema.parse({ tvShowName: "Synthetic Show", createShow: true, publisher: "Synthetic Publisher", title: null }).createShow)
			.toBe(true);
		expect(() => episodeTvShowMoveRequestSchema.parse({ tvShowId: "not-a-guid" })).toThrow();
		expect(episodeTvShowMoveResponseSchema.parse({ tvShowId, tvShowName: "Synthetic Show", episodeId: tvShowId, createdShow: true, failureIndexing: false }).createdShow)
			.toBe(true);
	});

	it("parses the move-to-film request and identityDecision / cancelled 200 bodies", () => {
		expect(episodeFilmMoveRequestSchema.parse({
			identityDecision: "select",
			selectedIdentityKey: "tmdb:42"
		}).selectedIdentityKey).toBe("tmdb:42");
		const ambiguous = episodeFilmMoveResponseSchema.parse({
			identityDecision: {
				target: "Film",
				query: "Synthetic Film",
				candidates: [{
					key: "tmdb:42",
					title: "Synthetic Film",
					kind: "Film",
					source: "tmdb",
					tmdbId: 42
				}]
			}
		});
		expect(ambiguous.identityDecision?.candidates[0].key).toBe("tmdb:42");
		expect(episodeFilmMoveResponseSchema.parse({ cancelled: true }).cancelled).toBe(true);
	});

	it("rejects non-URL imdb on Catalogue GET DTO schemas", () => {
		expect(() =>
			filmDtoSchema.parse({
				id: "550e8400-e29b-41d4-a716-446655440000",
				name: "Catalogue Film Title",
				imdb: "not-a-url"
			})
		).toThrow();
		expect(() =>
			tvShowDtoSchema.parse({
				id: "550e8400-e29b-41d4-a716-446655440000",
				name: "Catalogue Show Title",
				imdb: "not-a-url"
			})
		).toThrow();
		expect(() =>
			tvShowEpisodeDtoSchema.parse({
				id: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
				tvShowId: "550e8400-e29b-41d4-a716-446655440000",
				title: "Episode Title",
				imdb: "not-a-url"
			})
		).toThrow();
	});

	it("parses Catalogue change requests as Azure identity ids (clear/empty semantics)", () => {
		expect(
			tvShowChangeRequestSchema.parse({ imdbId: null, tvdbId: 0, tmdbId: 12 })
		).toEqual({ imdbId: null, tvdbId: 0, tmdbId: 12 });
		expect(
			tvShowEpisodeChangeRequestSchema.parse({ imdbId: "", tvdbId: null, tmdbId: 0 })
		).toEqual({ imdbId: "", tvdbId: null, tmdbId: 0 });
		expect(filmChangeRequestSchema.parse({ imdbId: "tt0000001", tmdbId: 0 })).toEqual({
			imdbId: "tt0000001",
			tmdbId: 0
		});
		expect(filmChangeRequestSchema.parse({ imdbId: null }).imdbId).toBeNull();
		expect(filmChangeRequestSchema.parse({ imdb: "https://www.imdb.com/title/tt1/" })).not.toHaveProperty("imdb");
		expect(() => tvShowChangeRequestSchema.parse({ tvdbId: "12" })).toThrow();
		expect(() => filmChangeRequestSchema.parse({ tmdbId: "7" })).toThrow();
	});
	it("bounds the film tmdbId to int32 as RPP binds int? (Api#182)", () => {
		expect(filmChangeRequestSchema.parse({ tmdbId: 0 }).tmdbId).toBe(0);
		expect(filmChangeRequestSchema.parse({ tmdbId: 2147483647 }).tmdbId).toBe(2147483647);
		expect(filmChangeRequestSchema.parse({ tmdbId: null }).tmdbId).toBeNull();
		expect(filmChangeRequestSchema.safeParse({ tmdbId: -1 }).success).toBe(false);
		expect(filmChangeRequestSchema.safeParse({ tmdbId: 2147483648 }).success).toBe(false);
		expect(filmChangeRequestSchema.safeParse({ tmdbId: 1.5 }).success).toBe(false);
	});
	it("parses TV show, TV episode and film GET DTOs with the RPP #1053 parity fields (synthetic)", () => {
		const show = tvShowDtoSchema.parse({
			id: "550e8400-e29b-41d4-a716-446655440000",
			name: "Synthetic Docuseries",
			imdb: "https://www.imdb.com/title/tt0000001/",
			imdbId: "tt0000001",
			tvdb: null,
			tvdbId: null,
			tmdbId: 101,
			language: "fr",
			removed: false,
			twitterHandle: "@synthetic",
			blueskyHandle: null,
			hashTag: "#Synthetic",
			enrichmentHashTags: null,
			searchTerms: "synthetic terms",
			knownTerms: ["Term"],
			defaultSubject: null,
			ignoredSubjects: null,
			ignoredAssociatedSubjects: null,
			latestReleased: null,
			lastIndexed: null
		});
		expect(show.searchTerms).toBe("synthetic terms");
		const episode = tvShowEpisodeDtoSchema.parse({
			id: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
			tvShowId: "550e8400-e29b-41d4-a716-446655440000",
			tvShowName: "Synthetic Docuseries",
			title: "Synthetic Episode",
			description: "",
			release: "2026-09-01",
			duration: "0:44:00",
			explicit: false,
			ignored: false,
			removed: false,
			tweeted: false,
			blueskyPosted: false,
			subjects: ["Synthetic Cult"],
			searchTerms: null,
			hashTag: null,
			language: null,
			guests: ["Synthetic Survivor"],
			services: null,
			imdb: null,
			tvdb: null
		});
		expect(episode.guests).toEqual(["Synthetic Survivor"]);
		expect(() => tvShowEpisodeDtoSchema.parse({ ...episode, release: "2026-09-01T10:00:00" })).toThrow();
		const film = filmDtoSchema.parse({
			id: "550e8400-e29b-41d4-a716-446655440000",
			name: "Synthetic Film",
			imdb: null,
			release: "1999",
			duration: "1:30:00",
			description: "Synthetic",
			explicit: false,
			ignored: false,
			tweeted: false,
			blueskyPosted: false,
			subjects: [],
			guests: ["Synthetic Director"],
			removed: false,
			twitterHandle: ""
		});
		expect(film.release).toBe("1999");
		expect(filmDtoSchema.parse({ ...film, release: "1999-05-04" }).release).toBe("1999-05-04");
		expect(() => filmDtoSchema.parse({ ...film, release: "99" })).toThrow();
		expect(() => filmDtoSchema.parse({ ...film, guests: "Synthetic Director" })).toThrow();
	});

	it("parses TV and film change requests with publisher/playable fields, guests, and identity ids", () => {
		expect(
			tvShowChangeRequestSchema.parse({
				imdbId: "",
				tvdbId: null,
				tmdbId: 0,
				searchTerms: "",
				language: "de",
				knownTerms: []
			})
		).toEqual({
			imdbId: "",
			tvdbId: null,
			tmdbId: 0,
			searchTerms: "",
			language: "de",
			knownTerms: []
		});
		expect(
			tvShowEpisodeChangeRequestSchema.parse({
				title: "Synthetic",
				release: "2026-10-02",
				guests: [],
				removed: true,
				imdbId: "tt0000002"
			})
		).toEqual({
			title: "Synthetic",
			release: "2026-10-02",
			guests: [],
			removed: true,
			imdbId: "tt0000002"
		});
		expect(
			filmChangeRequestSchema.parse({ release: "1999", duration: "1:42:00", guests: ["Synthetic"], hashTag: "", subjects: [] })
		).toEqual({ release: "1999", duration: "1:42:00", guests: ["Synthetic"], hashTag: "", subjects: [] });
		expect(newsReportChangeRequestSchema.parse({ guests: [" Synthetic "] }).guests).toEqual([" Synthetic "]);
		expect(() => tvShowEpisodeChangeRequestSchema.parse({ guests: "Synthetic" })).toThrow();
		expect(() => filmChangeRequestSchema.parse({ explicit: "yes" })).toThrow();
		expect(() => tvShowChangeRequestSchema.parse({ enrichmentHashTags: "#A" })).toThrow();
	});

	it("parses the podcast discovery flags on news organisation and TV show PATCH and GET with podcast wire names (synthetic)", () => {
		const flags = {
			indexAllEpisodes: false,
			episodeIncludeTitleRegex: "Synthetic",
			titleRegex: "",
			ignoreAllEpisodes: true,
			bypassShortEpisodeChecking: false,
			alwaysPromoteAsHero: true,
			skipEnrichingFromYouTube: false,
			minimumDuration: "00:01:30",
			releaseAuthority: "YouTube",
			unsetReleaseAuthority: false,
			youTubePublicationDelay: "-1:00:00"
		};
		expect(newsOrganisationChangeRequestSchema.parse(flags)).toEqual(flags);
		expect(tvShowChangeRequestSchema.parse(flags)).toEqual(flags);
		expect(() => newsOrganisationChangeRequestSchema.parse({ releaseAuthority: "Bbc" })).toThrow();
		expect(() => tvShowChangeRequestSchema.parse({ alwaysPromoteAsHero: "yes" })).toThrow();
		expect(filmChangeRequestSchema.parse({ alwaysPromoteAsHero: true })).not.toHaveProperty("alwaysPromoteAsHero");
		const dto = {
			id: "550e8400-e29b-41d4-a716-446655440000",
			name: "Synthetic News Org",
			publisher: "",
			description: "",
			removed: false,
			twitterHandle: "",
			ignoreAllEpisodes: null,
			bypassShortEpisodeChecking: true,
			alwaysPromoteAsHero: true,
			skipEnrichingFromYouTube: null,
			minimumDuration: null,
			releaseAuthority: null,
			youTubePublicationDelay: "",
			indexAllEpisodes: true,
			episodeIncludeTitleRegex: ""
		};
		expect(newsOrganisationDtoSchema.parse(dto)).toMatchObject(dto);
		expect(
			tvShowDtoSchema.parse({ id: dto.id, name: "Synthetic Show", alwaysPromoteAsHero: true, youTubePublicationDelay: "-1:00:00" })
		).toMatchObject({ alwaysPromoteAsHero: true, youTubePublicationDelay: "-1:00:00" });
	});

	it("parses alwaysPromoteAsHero on the podcast PATCH and GET schemas (synthetic)", () => {
		expect(podcastChangeRequestSchema.parse({ alwaysPromoteAsHero: true })).toEqual({ alwaysPromoteAsHero: true });
		expect(podcastDtoSchema.parse({ alwaysPromoteAsHero: false })).toEqual({ alwaysPromoteAsHero: false });
	});

	it("parses news organisation and TV show service ids (podcast wire names) in PATCH and GET, and keeps them off films (synthetic)", () => {
		const ids = {
			youTubeChannelId: "UCsyntheticChannel0000001",
			youTubePlaylistId: "",
			spotifyId: "syntheticSpotifyShow00001",
			appleId: 123456789,
			nullAppleId: false
		};
		expect(newsOrganisationChangeRequestSchema.parse(ids)).toEqual(ids);
		expect(tvShowChangeRequestSchema.parse({ ...ids, imdbId: "" })).toEqual({ ...ids, imdbId: "" });
		expect(newsOrganisationChangeRequestSchema.parse({ nullAppleId: true })).toEqual({ nullAppleId: true });
		expect(() => newsOrganisationChangeRequestSchema.parse({ appleId: "123" })).toThrow();
		expect(() => tvShowChangeRequestSchema.parse({ youTubeChannelId: 1 })).toThrow();
		expect(filmChangeRequestSchema.parse({ youTubeChannelId: "UCsyntheticChannel0000001" })).not.toHaveProperty("youTubeChannelId");
		const dto = {
			id: "550e8400-e29b-41d4-a716-446655440000",
			name: "Synthetic News Org",
			publisher: "",
			description: "",
			removed: false,
			twitterHandle: "",
			youTubeChannelId: "UCsyntheticChannel0000001",
			youTubePlaylistId: "PLsyntheticPlaylist000002",
			youTubePlaylistIdHistory: [{ id: "PLsyntheticPlaylist000001", replacedAt: "2026-10-21T20:00:00Z" }],
			spotifyId: "",
			appleId: null
		};
		expect(newsOrganisationDtoSchema.parse(dto).youTubePlaylistIdHistory).toEqual(dto.youTubePlaylistIdHistory);
		expect(tvShowDtoSchema.parse({ id: dto.id, name: "Synthetic Show", spotifyId: "x" }).spotifyId).toBe("x");
	});

	it("parses publisher, description, cascading removed and episode-style post status in news/TV/film change requests (synthetic)", () => {
		const publisherEdit = { publisher: "Synthetic Studios", description: "", removed: true };
		expect(newsOrganisationChangeRequestSchema.parse(publisherEdit)).toEqual(publisherEdit);
		expect(tvShowChangeRequestSchema.parse(publisherEdit)).toEqual(publisherEdit);
		expect(filmChangeRequestSchema.parse({ publisher: "Synthetic Pictures" })).toEqual({ publisher: "Synthetic Pictures" });
		const postStatus = { posted: true, tweeted: false, unBluesky: true };
		expect(newsReportChangeRequestSchema.parse(postStatus)).toEqual(postStatus);
		expect(tvShowEpisodeChangeRequestSchema.parse(postStatus)).toEqual(postStatus);
		expect(filmChangeRequestSchema.parse(postStatus)).toEqual(postStatus);
		expect(() => newsReportChangeRequestSchema.parse({ unBluesky: "yes" })).toThrow();
		expect(() => tvShowChangeRequestSchema.parse({ removed: "true" })).toThrow();
		expect(() => newsOrganisationChangeRequestSchema.parse({ publisher: 1 })).toThrow();
	});

	it("requires publisher/description on the news organisation DTO and posted on the news report DTO, and accepts them on TV and film", () => {
		const org = {
			id: "550e8400-e29b-41d4-a716-446655440000",
			name: "Synthetic News Org",
			publisher: "Synthetic Broadcasting Corp",
			description: "Synthetic",
			removed: false,
			twitterHandle: ""
		};
		expect(newsOrganisationDtoSchema.parse(org).publisher).toBe("Synthetic Broadcasting Corp");
		const { publisher: _omitPublisher, ...orgWithoutPublisher } = org;
		expect(() => newsOrganisationDtoSchema.parse(orgWithoutPublisher)).toThrow();
		expect(tvShowDtoSchema.parse({ id: org.id, name: "Synthetic Show", publisher: "Synthetic Studios", description: "Synthetic" }).publisher).toBe(
			"Synthetic Studios"
		);
		expect(filmDtoSchema.parse({ id: org.id, name: "Synthetic Film", publisher: "Synthetic Pictures", posted: true }).posted).toBe(true);
		expect(
			tvShowEpisodeDtoSchema.parse({ id: org.id, tvShowId: org.id, title: "Synthetic", posted: false, blueskyPosted: false }).posted
		).toBe(false);
	});

	it("parses news organisation and news report GET DTOs (RPP #1053, synthetic)", () => {
		const org = newsOrganisationDtoSchema.parse({
			id: "550e8400-e29b-41d4-a716-446655440000",
			name: "Synthetic News Org",
			publisher: "Synthetic Broadcasting Corp",
			description: "",
			language: null,
			removed: false,
			twitterHandle: "@synthetic",
			blueskyHandle: null,
			hashTag: "#Synthetic",
			enrichmentHashTags: ["#A"],
			searchTerms: "synthetic terms",
			knownTerms: null,
			defaultSubject: null,
			ignoredSubjects: ["S"],
			ignoredAssociatedSubjects: null,
			latestReleased: "2026-10-03T00:00:00Z",
			lastIndexed: null
		});
		expect(org.twitterHandle).toBe("@synthetic");
		const report = newsReportDtoSchema.parse({
			id: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
			newsOrganisationId: "550e8400-e29b-41d4-a716-446655440000",
			newsOrganisationName: "Synthetic News Org",
			title: "Synthetic report",
			description: "",
			release: "2026-10-03",
			duration: "0:06:30",
			explicit: false,
			ignored: false,
			removed: false,
			posted: false,
			tweeted: true,
			blueskyPosted: false,
			subjects: ["Synthetic Subject"],
			searchTerms: null,
			hashTag: null,
			language: "de",
			guests: ["Synthetic Reporter"],
			services: { youtube: { url: "https://www.youtube.com/watch?v=synthetic", lang: "de" } }
		});
		expect(report.services?.youtube?.lang).toBe("de");
		expect(report.guests).toEqual(["Synthetic Reporter"]);
		expect(() => newsReportDtoSchema.parse({ ...report, release: "2026-10-03T10:00:00" })).toThrow();
		expect(() => newsOrganisationDtoSchema.parse({ ...org, id: "not-a-guid" })).toThrow();
	});

	it("parses news change requests: omitted/null unchanged, empty string and empty list allowed", () => {
		expect(newsOrganisationChangeRequestSchema.parse({})).toEqual({});
		expect(
			newsOrganisationChangeRequestSchema.parse({ language: "", searchTerms: "", knownTerms: [], hashTag: null })
		).toEqual({ language: "", searchTerms: "", knownTerms: [], hashTag: null });
		expect(
			newsReportChangeRequestSchema.parse({ release: "2026-10-03", duration: "0:06:30", removed: true, subjects: [] })
		).toEqual({ release: "2026-10-03", duration: "0:06:30", removed: true, subjects: [] });
		expect(() => newsReportChangeRequestSchema.parse({ explicit: "yes" })).toThrow();
		const servicesPatch = {
			services: {
				youtube: { url: "" },
				bbcIplayer: { url: "https://www.bbc.co.uk/iplayer/episode/synthetic" }
			}
		};
		expect(newsReportChangeRequestSchema.parse(servicesPatch)).toEqual(servicesPatch);
		expect(tvShowEpisodeChangeRequestSchema.parse(servicesPatch)).toEqual(servicesPatch);
		const removeKeyPatch = {
			services: {
				youtube: { url: "", image: "" },
				internetArchive: {}
			}
		};
		expect(newsReportChangeRequestSchema.parse(removeKeyPatch)).toEqual(removeKeyPatch);
		expect(tvShowEpisodeChangeRequestSchema.parse(removeKeyPatch)).toEqual(removeKeyPatch);
		expect(notFoundIdSchema.parse({ id: "550e8400-e29b-41d4-a716-446655440000" }).id).toBe(
			"550e8400-e29b-41d4-a716-446655440000"
		);
	});
});
