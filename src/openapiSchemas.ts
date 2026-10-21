// pragma: allowlist secret
import { z } from "zod";
import { CatalogueParentKind } from "./catalogueParentKind";
import { streamingServiceKeys } from "../tests/fixtures/streaming-submit-contract";

/**
 * OpenAPI/Zod contracts for the Cloudflare Api worker.
 * Known Azure/DTO / R2 / Search shapes are strict objects (no `.passthrough()` /
 * open records) so Swagger examples show real fields instead of additionalProp1/2/3.
 */

export const errorSchema = z.object({
	error: z.string().optional(),
	message: z.string().optional()
});

/**
 * ISO-8601 instant. Accepts `Z` and a numeric offset (`+00:00`).
 * OpenAPI format is `date-time`.
 */
const isoDateTime = z.string().datetime({ offset: true });

/** Simple `{ message }` success/error bodies (bookmarks, etc.). */
export const messageResponseSchema = z.object({
	message: z.string()
});

export function jsonBody(schema: z.ZodType) {
	return {
		content: {
			"application/json": {
				schema
			}
		},
		required: true
	} as const;
}

export const searchRequestSchema = z.object({
	search: z.string().optional(),
	filter: z.string().optional(),
	skip: z.string().optional(),
	orderby: z.string().optional()
});

/**
 * UUID list returned on ambiguous GET-by-name 409 for podcast, TV show, and film
 * (Azure `Conflict(AmbiguousIds)`). POST /submit uses the same array shape.
 */
export const ambiguousIdsSchema = z.array(z.string().uuid());
export const ambiguousPodcastIdsSchema = ambiguousIdsSchema;

export const submitUrlRequestSchema = z.object({
	url: z.string().url(),
	podcastId: z.string().uuid().optional().nullable(),
	podcastName: z.string().optional().nullable(),
	parentKind: z
		.string()
		.regex(/^(NewsOrganisation|TvShow)$/i)
		.optional()
		.nullable()
		.describe("Attach to a news organisation or TV show instead of a podcast (RPP #1054): `NewsOrganisation` or `TvShow`, case-insensitive. Requires `submit` or `curate`; never combined with `podcastId` / `podcastName` (400)."),
	parentId: z.string().uuid().optional().nullable().describe("Guid of the `parentKind` row (404 when it is not one)."),
	parentName: z.string().optional().nullable().describe("Parent name, a check and log aid; `parentId` decides the target.")
});

export const submitUrlPrepareRequestSchema = z.object({
	url: z.string().url()
});

export const htmlFetchModeSchema = z.enum(["directHttp", "browserRendering"]);

/** Query `url` is validated by Azure SubmitUrl (absolute http/https), not Worker z.url(). */
export const submitUrlLookupQuerySchema = z.object({
	url: z.string()
});

/** Azure UrlMembershipLookupKinds / website SubmitUrlLookupKind. */
export const submitUrlLookupKindSchema = z.enum([
	"podcast-service",
	"streaming",
	"unrecognised"
]);

/**
 * Streaming ServiceKeys wire values (podcast-service platforms excluded).
 * Derived from the contract fixture so OpenAPI cannot drift from website/RPP copies.
 */
export const streamingServiceKeySchema = z.enum(streamingServiceKeys);

export const submitUrlPrepareResponseSchema = z.object({
	service: streamingServiceKeySchema,
	htmlFetchMode: htmlFetchModeSchema,
	podcastName: z.string().nullable(),
	title: z.string().nullable()
});

/**
 * GET /submit/lookup 200 — Cosmos URL membership (passthrough of Azure SubmitUrlLookupResponse).
 * Three arms match website SubmitUrlLookupResponse:
 * unique known / unknown (kind required) / ambiguous (not 409).
 * Streaming arms include `service` (ServiceKeys).
 */
export const submitUrlLookupKnownSchema = z
	.object({
		known: z.literal(true),
		podcastId: z.string().uuid(),
		podcastName: z.string(),
		kind: submitUrlLookupKindSchema.optional(),
		service: streamingServiceKeySchema.optional().nullable()
	})
	.strict();

export const submitUrlLookupUnknownSchema = z
	.object({
		known: z.literal(false),
		kind: submitUrlLookupKindSchema,
		ambiguous: z.literal(false).optional(),
		podcastName: z.string().optional().nullable(),
		service: streamingServiceKeySchema.optional().nullable()
	})
	.strict();

export const submitUrlLookupAmbiguousSchema = z
	.object({
		known: z.literal(false),
		ambiguous: z.literal(true),
		podcastIds: z.array(z.string().uuid()).min(1),
		kind: submitUrlLookupKindSchema.optional(),
		service: streamingServiceKeySchema.optional().nullable()
	})
	.strict();

export const submitUrlLookupResponseSchema = z.union([
	submitUrlLookupAmbiguousSchema,
	submitUrlLookupKnownSchema,
	submitUrlLookupUnknownSchema
]);

export const discoverySubmitRequestSchema = z.object({
	ids: z.array(z.string().uuid()),
	resultIds: z.array(z.string().uuid())
});

export const discoveryScheduleUpdateRequestSchema = z.object({
	runTimes: z.array(z.string()),
	timeZoneId: z.string().optional().nullable(),
	enabled: z.boolean().optional().nullable()
});

export const discoveryScheduleResponseSchema = z.object({
	runTimes: z.array(z.string()),
	timeZoneId: z.string(),
	enabled: z.boolean(),
	isDefault: z.boolean(),
	nextRuns: z.array(z.object({
		slotId: z.string().describe("Display label such as `2026-10-08 22:30 UK`. Not an ISO-8601 timestamp."),
		slotStartUtc: isoDateTime,
		slotStartUk: isoDateTime
	}))
});

/** Api.Dtos.SupportedLanguagesResponse */
const supportedLanguageSchema = z.object({
	code: z.string(),
	name: z.string()
});

export const supportedLanguageAddRequestSchema = z.object({
	name: z.string().min(1)
});

export const supportedLanguagesResponseSchema = z.object({
	languages: z.array(supportedLanguageSchema),
	isDefault: z.boolean()
});

export const neutralCulturesResponseSchema = z.object({
	cultures: z.array(supportedLanguageSchema)
});

/** Api.Dtos.LanguageTitleCasingRulesResponse */
const knownTermSchema = z.object({
	literal: z.string(),
	pattern: z.string(),
	options: z.string().optional().nullable()
});

export const titleCasingRulesAddLowerCaseTermRequestSchema = z.object({
	term: z.string().min(1)
});

export const titleCasingRulesKnownTermRequestSchema = z.object({
	pattern: z.string(),
	options: z.string().optional().nullable()
});

export const titleCasingRulesAddIgnoredSubjectRequestSchema = z.object({
	term: z.string().min(1)
});

export const languageTitleCasingRulesResponseSchema = z.object({
	language: z.string(),
	lowerCaseTerms: z.array(z.string()),
	knownTerms: z.array(knownTermSchema),
	ignoredSubjects: z.array(z.string()).optional(),
	isDefault: z.boolean()
});

const heroEpisodeIdList = z.array(z.string().uuid()).min(1);

/**
 * PUT /hero-curation command. Omit a list to leave that list stored.
 * At least one of episodeIds or railSubjects is required.
 */
export const heroCurationUpdateRequestSchema = z.object({
	episodeIds: z.array(z.string().uuid()).optional().describe(
		"Ordered episode UUIDs. Omit to leave the stored hero list unchanged. Duplicates are removed. The list is capped at 50."
	),
	railSubjects: z.array(z.string().min(1).max(200)).optional().describe(
		"Ordered homepage rails. Each entry is a subject name or a relative day slot (day:0 is newest). Omit to leave the stored rails unchanged. Subject names are capped at 12. Day slots are kept."
	),
	expectedUpdatedAt: isoDateTime.optional().nullable().describe(
		"Compare-and-swap token from GET /hero-curation updatedAt (ISO-8601 with offset). A non-null value that does not equal updatedAt is 409 with an empty body. Omit this field or send null to write without compare-and-swap."
	)
});

/** POST /hero-curation/episodes command. No compare-and-swap. */
export const heroCurationAppendRequestSchema = z.object({
	episodeIds: heroEpisodeIdList.describe(
		"Episode UUIDs to add. An id already in the list stays in place. New ids are inserted at the front."
	)
});

/** DELETE /hero-curation/episodes command. Same JSON shape as append. No compare-and-swap. */
export const heroCurationDeleteEpisodesRequestSchema = z.object({
	episodeIds: heroEpisodeIdList.describe(
		"Episode UUIDs to remove. An id that is not in the list is ignored."
	)
});

/** GET /hero-curation query. The read model for this resource. */
export const heroCurationResponseSchema = z.object({
	episodeIds: z.array(z.string().uuid()).describe("Ordered hero episode UUIDs."),
	railSubjects: z.array(z.string()).describe(
		"Ordered homepage rails: subject names and relative day slots (day:0 is newest)."
	),
	updatedAt: isoDateTime.nullable().describe(
		"ISO-8601 compare-and-swap token for PUT /hero-curation. Null when the store has no timestamp."
	)
});

/** GET /discovery-curation — mirrors Api.Dtos.DiscoveryResponse. */
const discoveryResultUrlsSchema = z.object({
	spotify: z.string().url().optional().nullable(),
	apple: z.string().url().optional().nullable(),
	youtube: z.string().url().optional().nullable()
});

const discoverServiceSchema = z.enum(["Spotify", "ListenNotes", "YouTube", "Taddy"]);

const discoveryMatchingPodcastSchema = z.object({
	name: z.string(),
	visible: z.boolean(),
	visibleEpisodes: z.number()
});

/** Api.Dtos.SubjectMatchDto — why a subject matched; `source` serialises as the enum name. */
const episodeSubjectMatchSchema = z.object({
	subject: z.string(),
	term: z.string(),
	source: z.enum(["Title", "Description", "PodcastDefault"])
}).describe("Why a subject matched: the subject, the term (subject name or alias) that matched, and where it matched.");

const discoveryCurationItemSchema = z.object({
	id: z.string().uuid(),
	episodeName: z.string().optional().nullable(),
	showName: z.string().optional().nullable(),
	episodeDescription: z.string().optional().nullable(),
	showDescription: z.string().optional().nullable(),
	released: isoDateTime,
	duration: z.string().optional().nullable(),
	urls: discoveryResultUrlsSchema,
	subjects: z.array(z.string()),
	subjectMatches: z.array(episodeSubjectMatchSchema).optional().nullable().describe(
		"Why each subject matched. null = historic result recorded before match reasons existed; [] = no subject matches."
	),
	youTubeViews: z.number().optional().nullable(),
	youTubeChannelMembers: z.number().optional().nullable(),
	imageUrl: z.string().url().optional().nullable(),
	discoverService: z.array(discoverServiceSchema),
	enrichedTimeFromApple: z.boolean(),
	enrichedUrlFromSpotify: z.boolean(),
	matchingPodcasts: z.array(discoveryMatchingPodcastSchema).optional().nullable(),
	acceptProbability: z.number().optional().nullable(),
	autoHidden: z.boolean(),
	containsSyntheticMedia: z.boolean().optional().nullable(),
	guests: z.array(z.string()).optional().nullable()
});

/** Api.Dtos.DiscoveryAwaitingReviewDto — a report held for supervisor review. */
export const discoveryAwaitingReviewSchema = z.object({
	id: z.string().uuid(),
	discoveryBegan: isoDateTime,
	resultCount: z.number().int()
}).describe("A discovery report held by a supervised curator's submission (state PendingSupervisor). Its results are excluded from `results`.");

export const discoveryCurationResponseSchema = z.object({
	ids: z.array(z.string().uuid()),
	results: z.array(discoveryCurationItemSchema),
	hiddenCount: z.number(),
	awaitingReview: z.array(discoveryAwaitingReviewSchema).optional().describe(
		"Reports held for supervisor review (PendingSupervisor). Their results are excluded from `results`."
	)
});

/** GET /flairs — R2 map keyed by Reddit flair template id (Guid). */
export const flairSchema = z.object({
	text: z.string(),
	textEditable: z.boolean(),
	textColour: z.string(),
	backgroundColour: z.string()
});

export const flairsResponseSchema = z.record(z.string().uuid(), flairSchema);

/** GET /languages — R2 map of ISO 639-1 code → English display name. */
export const languagesResponseSchema = z.record(z.string(), z.string());

/** GET /bookmarks — episode ids for the authenticated user. */
export const bookmarksListResponseSchema = z.array(z.string().uuid());

export const catalogueParentKindSchema = z.nativeEnum(CatalogueParentKind);

export const podcastKindTransferRequestSchema = z.object({
	targetKind: catalogueParentKindSchema
});

export const podcastKindTransferResponseSchema = z.object({
	parentId: z.string().uuid().optional().nullable(),
	targetKind: catalogueParentKindSchema.optional().nullable(),
	playableCount: z.number().int().optional(),
	failureIndexingPlayables: z.boolean().optional()
});

export const podcastRenameRequestSchema = z.object({
	newPodcastName: z.string().min(1)
});

export const pushSubscriptionRequestSchema = z.object({
	endpoint: z.string().url(),
	expirationTime: z.number().optional().nullable(),
	keys: z.object({
		auth: z.string(),
		p256dh: z.string()
	})
});

/** ServiceUrls — RedditPodcastPoster.Models.Podcasts.ServiceUrls (response / absolute URIs). */
export const serviceUrlsSchema = z.object({
	spotify: z.string().url().optional().nullable(),
	apple: z.string().url().optional().nullable(),
	youtube: z.string().url().optional().nullable(),
	internetArchive: z.string().url().optional().nullable(),
	bbc: z.string().url().optional().nullable()
});

/** ServiceImageUrls — RedditPodcastPoster.Models.Podcasts.ServiceImageUrls */
export const serviceImageUrlsSchema = z.object({
	spotify: z.string().url().optional().nullable(),
	apple: z.string().url().optional().nullable(),
	youtube: z.string().url().optional().nullable(),
	other: z.string().url().optional().nullable()
});

/** @deprecated Prefer serviceImageUrlsSchema */
export const episodeImagesSchema = serviceImageUrlsSchema;

export const episodeServiceLinkSchema = z.object({ // pragma: allowlist secret
	url: z.string().url().optional().nullable(),
	image: z.string().url().optional().nullable()
});

export const episodeServicesSchema = z.record(z.string(), episodeServiceLinkSchema); // pragma: allowlist secret

/** Nested platform ids — presence of Spotify / Apple / YouTube, not a named URL slot. */
export const episodeIdsSchema = z.object({
	spotify: z.string().optional().nullable(),
	apple: z.number().optional().nullable(),
	youtube: z.string().optional().nullable()
});

/**
 * Patch URI: absolute URL, empty string (Angular clears with ''), or null.
 * Mirrors System.Uri? JSON on EpisodeChangeRequest.urls / images.
 */
const patchUriSchema = z.union([z.string().url(), z.literal(""), z.null()]).optional();

const serviceUrlsChangeSchema = z.object({
	spotify: patchUriSchema,
	apple: patchUriSchema,
	youtube: patchUriSchema,
	internetArchive: patchUriSchema,
	bbc: patchUriSchema
});

const serviceImageUrlsChangeSchema = z.object({
	spotify: patchUriSchema,
	apple: patchUriSchema,
	youtube: patchUriSchema,
	other: patchUriSchema
});

/** JsonStringEnumConverter — RedditPodcastPoster.Models.Podcasts.Service */
export const serviceEnumSchema = z.enum(["Spotify", "Apple", "YouTube", "Other"]);

/** JsonStringEnumConverter — RedditPodcastPoster.Models.Subjects.SubjectType */
export const subjectTypeSchema = z.enum(["Unset", "Canonical", "Meta"]);

/** Api.Models.EpisodeChangeRequest */
export const episodeChangeRequestSchema = z.object({
	title: z.string().optional().nullable(),
	description: z.string().optional().nullable(),
	posted: z.boolean().optional().nullable(),
	tweeted: z.boolean().optional().nullable(),
	/** When true, clear Bluesky post state and delete the remote post. Not settable via edit form. */
	unBluesky: z.boolean().optional().nullable(),
	ignored: z.boolean().optional().nullable(),
	removed: z.boolean().optional().nullable(),
	explicit: z.boolean().optional().nullable(),
	release: isoDateTime.optional().nullable(),
	duration: z.string().optional().nullable(),
	urls: serviceUrlsChangeSchema.optional().nullable(),
	images: serviceImageUrlsChangeSchema.optional().nullable(),
	services: episodeServicesSchema.optional().nullable(), // pragma: allowlist secret
	subjects: z.array(z.string()).optional().nullable(),
	searchTerms: z.string().optional().nullable(),
	hashTag: z.string().optional().nullable(),
	lang: z.string().optional().nullable(),
	guests: z.array(z.string()).optional().nullable()
});

/** Api.Models.PersonChangeRequest */
export const personChangeRequestSchema = z.object({
	id: z.string().uuid().optional().nullable(),
	name: z.string().optional().nullable(),
	sortName: z.string().optional().nullable(),
	isOrganization: z.boolean().optional().nullable(),
	aliases: z.array(z.string()).optional().nullable(),
	twitterHandle: z.string().optional().nullable(),
	blueskyHandle: z.string().optional().nullable()
});

/** Api.Models.SubjectChangeRequest */
export const subjectChangeRequestSchema = z.object({
	id: z.string().uuid().optional().nullable(),
	aliases: z.array(z.string()).optional().nullable(),
	associatedSubjects: z.array(z.string()).optional().nullable(),
	name: z.string().optional().nullable(),
	enrichmentHashTags: z.array(z.string()).optional().nullable(),
	hashTag: z.string().optional().nullable(),
	redditFlairTemplateId: z.string().uuid().optional().nullable(),
	redditFlareText: z.string().optional().nullable(),
	subjectType: subjectTypeSchema.optional().nullable(),
	knownTerms: z.array(z.string()).optional().nullable()
});

/** Api.Models.PodcastChangeRequest */
export const podcastChangeRequestSchema = z.object({
	id: z.string().uuid().optional().nullable(),
	name: z.string().optional().nullable(),
	lang: z.string().optional().nullable(),
	removed: z.boolean().optional().nullable(),
	indexAllEpisodes: z.boolean().optional().nullable(),
	bypassShortEpisodeChecking: z.boolean().optional().nullable(),
	releaseAuthority: serviceEnumSchema.optional().nullable(),
	unsetReleaseAuthority: z.boolean().optional().nullable(),
	primaryPostService: serviceEnumSchema.optional().nullable(),
	unsetPrimaryPostService: z.boolean().optional().nullable(),
	spotifyId: z.string().optional().nullable(),
	appleId: z.number().int().optional().nullable(),
	nullAppleId: z.boolean().optional().nullable(),
	youTubePublicationDelay: z.string().optional().nullable(),
	skipEnrichingFromYouTube: z.boolean().optional().nullable(),
	twitterHandle: z.string().optional().nullable(),
	blueskyHandle: z.string().optional().nullable(),
	enrichmentHashTags: z.array(z.string()).optional().nullable(),
	hashTag: z.string().optional().nullable(),
	titleRegex: z.string().optional().nullable(),
	descriptionRegex: z.string().optional().nullable(),
	episodeMatchRegex: z.string().optional().nullable(),
	episodeIncludeTitleRegex: z.string().optional().nullable(),
	defaultSubject: z.string().optional().nullable(),
	ignoreAllEpisodes: z.boolean().optional().nullable(),
	youTubeChannelId: z.string().optional().nullable(),
	youTubePlaylistId: z.string().optional().nullable(),
	ignoredAssociatedSubjects: z.array(z.string()).optional().nullable(),
	ignoredSubjects: z.array(z.string()).optional().nullable(),
	knownTerms: z.array(z.string()).optional().nullable(),
	minimumDuration: z.string().optional().nullable()
});

/** Api.Models.EpisodePublishRequest */
export const episodePublishRequestSchema = z.object({
	post: z.boolean(),
	tweet: z.boolean(),
	blueskyPost: z.boolean()
});

// --- Azure Functions response DTOs (Cloud/Api/Dtos) ---

export const searchIndexerStateSchema = z.enum([
	"EpisodeNotFound",
	"EpisodeIdConflict",
	"NoDocuments",
	"Executed",
	"Failure",
	"TooManyRequests",
	"AlreadyRunning",
	"Unknown"
]);

/** JsonStringEnumConverter Service values used on EpisodeDto / PodcastDto. */
export const serviceNameSchema = serviceEnumSchema;

export const personDtoSchema = z.object({
	id: z.string().uuid().optional().nullable(),
	name: z.string().optional().nullable(),
	sortName: z.string().optional().nullable(),
	isOrganization: z.boolean().optional().nullable(),
	aliases: z.array(z.string()).optional().nullable(),
	twitterHandle: z.string().optional().nullable(),
	blueskyHandle: z.string().optional().nullable()
});

export const peopleListResponseSchema = z.array(personDtoSchema);

const episodeGuestMatchResultSchema = z.object({
	term: z.string(),
	matches: z.number()
});

const episodeGuestSuggestionSchema = z.object({
	person: personDtoSchema,
	matchResults: z.array(episodeGuestMatchResultSchema)
});

/** Api.Dtos.EpisodeDto — TimeSpan `duration` serialises as string (e.g. "01:30:00"). */
export const episodeDtoSchema = z.object({
	id: z.string().uuid(),
	podcastId: z.string().uuid(),
	podcastName: z.string(),
	title: z.string(),
	displayTitle: z.string().optional(),
	description: z.string(),
	displayDescription: z.string().optional(),
	release: isoDateTime,
	duration: z.string(),
	explicit: z.boolean(),
	posted: z.boolean(),
	tweeted: z.boolean(),
	bluesky: z.boolean().optional().nullable(),
	ignored: z.boolean(),
	removed: z.boolean(),
	lang: z.string().optional().nullable(),
	spotifyId: z.string().optional(),
	appleId: z.number().optional().nullable(),
	youTubeId: z.string().optional(),
	ids: episodeIdsSchema.optional().nullable(),
	urls: serviceUrlsSchema,
	subjects: z.array(z.string()),
	removedSubjects: z.array(z.string()).optional(),
	matches: z.array(episodeSubjectMatchSchema).optional(),
	searchTerms: z.string().optional().nullable(),
	hashTag: z.string().optional().nullable(),
	images: serviceImageUrlsSchema.optional().nullable(),
	services: episodeServicesSchema.optional().nullable(), // pragma: allowlist secret
	guests: z.array(z.string()).optional().nullable(),
	youTubePodcast: z.boolean().optional(),
	spotifyPodcast: z.boolean().optional(),
	applePodcast: z.boolean().optional(),
	releaseAuthority: serviceNameSchema.optional().nullable(),
	primaryPostService: serviceNameSchema.optional().nullable(),
	image: z.string().url().optional().nullable(),
	guestPeople: z.array(personDtoSchema).optional().nullable(),
	guestSuggestions: z.array(episodeGuestSuggestionSchema).optional().nullable()
});

export const episodeListResponseSchema = z.array(episodeDtoSchema);

/** Api.Dtos.PublicEpisodeDto */
export const publicEpisodeDtoSchema = z.object({
	id: z.string().uuid(),
	podcastName: z.string(),
	title: z.string(),
	description: z.string(),
	release: isoDateTime,
	duration: z.string(),
	explicit: z.boolean(),
	subjects: z.array(z.string()),
	ids: episodeIdsSchema.optional().nullable(),
	services: episodeServicesSchema.optional().nullable(), // pragma: allowlist secret
	image: z.string().url().optional().nullable()
});

/** Api.Dtos.EpisodeUpdateResponse — POST episode → 202 */
export const episodeUpdateResponseSchema = z.object({
	tweetDeleted: z.boolean().optional().nullable(),
	blueskyPostDeleted: z.boolean().optional().nullable(),
	searchIndexerState: searchIndexerStateSchema.optional().nullable()
});

/** Api.Dtos.EpisodePublishResponse */
export const episodePublishResponseSchema = z.object({
	posted: z.boolean().optional().nullable(),
	tweeted: z.boolean().optional().nullable(),
	blueskyPosted: z.boolean().optional().nullable(),
	failedTweetContent: z.string().optional().nullable(),
	podcastId: z.string().uuid().optional().nullable()
});

/** Api.Dtos.SubjectDto */
export const subjectDtoSchema = z.object({
	id: z.string().uuid().optional().nullable(),
	aliases: z.array(z.string()).optional().nullable(),
	associatedSubjects: z.array(z.string()).optional().nullable(),
	name: z.string().optional().nullable(),
	enrichmentHashTags: z.array(z.string()).optional().nullable(),
	hashTag: z.string().optional().nullable(),
	redditFlairTemplateId: z.string().uuid().optional().nullable(),
	redditFlareText: z.string().optional().nullable(),
	subjectType: subjectTypeSchema.optional().nullable(),
	knownTerms: z.array(z.string()).optional().nullable()
});

/** Api.Dtos.PodcastDto */
export const podcastDtoSchema = z.object({
	id: z.string().uuid().optional().nullable(),
	name: z.string().optional().nullable(),
	lang: z.string().optional().nullable(),
	removed: z.boolean().optional().nullable(),
	indexAllEpisodes: z.boolean().optional().nullable(),
	bypassShortEpisodeChecking: z.boolean().optional().nullable(),
	releaseAuthority: serviceEnumSchema.optional().nullable(),
	unsetReleaseAuthority: z.boolean().optional().nullable(),
	primaryPostService: serviceEnumSchema.optional().nullable(),
	unsetPrimaryPostService: z.boolean().optional().nullable(),
	spotifyId: z.string().optional().nullable(),
	appleId: z.number().optional().nullable(),
	nullAppleId: z.boolean().optional().nullable(),
	youTubePublicationDelay: z.string().optional().nullable(),
	skipEnrichingFromYouTube: z.boolean().optional().nullable(),
	twitterHandle: z.string().optional().nullable(),
	blueskyHandle: z.string().optional().nullable(),
	enrichmentHashTags: z.array(z.string()).optional().nullable(),
	hashTag: z.string().optional().nullable(),
	titleRegex: z.string().optional().nullable(),
	descriptionRegex: z.string().optional().nullable(),
	episodeMatchRegex: z.string().optional().nullable(),
	episodeIncludeTitleRegex: z.string().optional().nullable(),
	defaultSubject: z.string().optional().nullable(),
	ignoreAllEpisodes: z.boolean().optional().nullable(),
	youTubeChannelId: z.string().optional().nullable(),
	youTubePlaylistId: z.string().optional().nullable(),
	ignoredAssociatedSubjects: z.array(z.string()).optional().nullable(),
	ignoredSubjects: z.array(z.string()).optional().nullable(),
	knownTerms: z.array(z.string()).optional().nullable(),
	minimumDuration: z.string().optional().nullable()
});

/** Api.Dtos.DiscoverySubmitResponse */
/** Api.Dtos.DiscoverySubmissionHeldResponse — 202 command outcome for a `curate:supervised` caller. */
export const discoverySubmissionHeldResponseSchema = z.object({
	submissionId: z.string().uuid(),
	status: z.literal("Pending")
}).describe("Submission held for supervisor review; nothing was applied.");

/** Api.Dtos.DiscoveryErrorResponse — `{message}` for missing subject (400), forbidden (403), not found (404), failure (500). */
export const discoveryErrorResponseSchema = z.object({
	message: z.string()
});

/** 409 body from POST /discovery-curation (camelCase DTO per RPP #1023). */
export const discoverySubmitConflictSchema = z.object({
	message: z.string(),
	documentIds: z.array(z.string().uuid()).optional().describe(
		"Report ids not available for curation (e.g. PendingSupervisor or already processed). Sent on both the normal and supervised submit paths."
	)
});

/** 400 body from POST /discovery-curation (camelCase DTO per RPP #1023). */
export const discoverySubmitBadRequestSchema = z.object({
	message: z.string(),
	resultIds: z.array(z.string().uuid()).optional().describe(
		"Supervised hold path: result ids that are not in the named reports."
	)
});

export const discoverySubmitResponseSchema = z.object({
	message: z.string(),
	errorsOccurred: z.boolean(),
	results: z.array(z.object({
		discoveryItemId: z.string().uuid(),
		podcastId: z.string().uuid().optional().nullable(),
		episodeId: z.string().uuid().optional().nullable(),
		message: z.string(),
		error: z.string().nullable().optional().describe("Why the item failed (exception type and message). null on success.")
	})),
	searchIndexerState: searchIndexerStateSchema
});

const nullableUuidArray = z.array(z.string().uuid()).nullable().optional();

export const discoverySubmissionStatusSchema = z.enum(["Pending", "Applied", "PartiallyApplied", "ApplyFailed", "Applying", "Released"]);

/** Api.Dtos.DiscoverySubmissionSummaryDto */
export const discoverySubmissionSummarySchema = z.object({
	id: z.string().uuid(),
	status: discoverySubmissionStatusSchema,
	submitterSubject: z.string(),
	submittedAt: isoDateTime,
	discoveryResultsDocumentIds: z.array(z.string().uuid()),
	submitterAcceptedCount: z.number().int(),
	supervisorSubject: z.string().nullable().optional(),
	appliedAt: isoDateTime.nullable().optional(),
	reportComment: z.string().nullable().optional(),
	itemCommentCount: z.number().int(),
	applyError: z.string().nullable().optional(),
	failedCount: z.number().int().nullable().optional().describe("Items that failed to ingest and await retry/abandon. null until an apply attempted ingestion."),
	succeededCount: z.number().int().nullable().optional(),
	abandonedCount: z.number().int().nullable().optional(),
	releasedAt: isoDateTime.nullable().optional(),
	releaseReason: z.string().nullable().optional(),
	inProgressOperation: z.enum(["Apply", "Retry", "Release"]).nullable().optional().describe("While status is Applying: the operation holding the submission. null otherwise."),
	inProgressSince: isoDateTime.nullable().optional()
});

/** Api.Dtos.DiscoverySubmissionListResponse — GET /discovery-submissions. */
export const discoverySubmissionListResponseSchema = z.object({
	view: z.enum(["supervisor", "submitter"]).describe(
		"supervisor = reviewable queue (Pending + ApplyFailed the caller may review, oldest first); submitter = caller's own submissions (any status, newest first)."
	),
	pendingCount: z.number().int().describe("Badge count. Supervisor: queue length. Submitter: own Pending."),
	submissions: z.array(discoverySubmissionSummarySchema)
});

/** Api.Dtos.DiscoverySubmissionItemCommentDto */
export const discoverySubmissionItemCommentSchema = z.object({
	resultId: z.string().uuid(),
	comment: z.string()
});

/** Api.Dtos.DiscoverySubmissionReportDto */
export const discoverySubmissionReportSchema = z.object({
	id: z.string().uuid(),
	discoveryBegan: isoDateTime,
	state: z.enum(["Unprocessed", "PendingSupervisor", "Processed"]),
	results: z.array(discoveryCurationItemSchema).describe("Every result in the report (same item shape as GET /discovery-curation), including auto-hidden.")
});

/** Api.Dtos.DiscoverySubmissionItemOutcomeDto */
export const discoverySubmissionItemOutcomeSchema = z.object({
	resultId: z.string().uuid(),
	state: z.enum(["Succeeded", "Failed", "Abandoned"]),
	episodeId: z.string().uuid().nullable().optional(),
	podcastId: z.string().uuid().nullable().optional(),
	message: z.string().nullable().optional().describe("Submit outcome from the ingester (e.g. Created, Enriched, Error)."),
	error: z.string().nullable().optional().describe("Why it failed. null unless the last attempt failed."),
	attempts: z.number().int(),
	lastAttemptAt: isoDateTime.nullable().optional()
});

/** Api.Dtos.DiscoverySubmissionHistoryDto */
export const discoverySubmissionHistorySchema = z.object({
	at: isoDateTime,
	actorSubject: z.string().nullable().optional(),
	action: z.enum([
		"Submitted", "ReviewSaved", "ApplyStarted", "Applied", "PartiallyApplied", "ApplyFailed", "ApplyConflict",
		"RetryStarted", "ItemsAbandoned", "ReleaseStarted", "Released", "StateChanged"
	])
,
	fromStatus: discoverySubmissionStatusSchema.nullable().optional().describe("StateChanged only: previous status."),
	toStatus: discoverySubmissionStatusSchema.nullable().optional().describe("StateChanged only: new status."),
	reason: z.string().nullable().optional().describe("StateChanged only: admin's reason.")
});

/** Api.Dtos.DiscoverySubmissionDetailResponse — GET /discovery-submissions/{id}. */
export const discoverySubmissionDetailResponseSchema = z.object({
	id: z.string().uuid(),
	status: discoverySubmissionStatusSchema,
	etag: z.string().describe("Opaque concurrency token; send back on review/apply."),
	canReview: z.boolean().describe("True when the caller may save a review / apply this submission now."),
	submitterSubject: z.string(),
	submittedAt: isoDateTime,
	submitterAcceptedResultIds: z.array(z.string().uuid()),
	supervisorAcceptedResultIds: nullableUuidArray.describe("null until a supervisor saves a review or applies."),
	addedBySupervisorResultIds: nullableUuidArray,
	removedBySupervisorResultIds: nullableUuidArray,
	reportComment: z.string().nullable().optional(),
	itemComments: z.array(discoverySubmissionItemCommentSchema),
	supervisorSubject: z.string().nullable().optional(),
	appliedAt: isoDateTime.nullable().optional(),
	applyError: z.string().nullable().optional(),
	erroredResultIds: nullableUuidArray,
	itemOutcomes: z.array(discoverySubmissionItemOutcomeSchema).nullable().optional().describe("Per-result apply/retry outcome with failure reasons. null until an apply attempted ingestion."),
	releasedAt: isoDateTime.nullable().optional(),
	releaseReason: z.string().nullable().optional(),
	inProgressOperation: z.enum(["Apply", "Retry", "Release"]).nullable().optional().describe("While status is Applying: the operation holding the submission. null otherwise."),
	inProgressSince: isoDateTime.nullable().optional(),
	reports: z.array(discoverySubmissionReportSchema),
	history: z.array(discoverySubmissionHistorySchema)
});

/** Api.Dtos.DiscoverySubmissionReviewRequestDto — PUT /discovery-submissions/{id}/review. Omitted (null) members are unchanged. */
export const discoverySubmissionReviewRequestSchema = z.object({
	etag: z.string().describe("Required, from GET."),
	reportComment: z.string().nullable().optional().describe("Report-level comment. Empty string clears it."),
	itemComments: z.array(discoverySubmissionItemCommentSchema).nullable().optional().describe("Replaces all item comments; [] clears. Max 4000 chars per comment."),
	acceptedResultIds: z.array(z.string().uuid()).nullable().optional().describe("Supervisor's final accepted set: any result ids within the held reports.")
});

/** Api.Dtos.DiscoverySubmissionApplyRequestDto — POST /discovery-submissions/{id}/apply. */
export const discoverySubmissionApplyRequestSchema = z.object({
	etag: z.string(),
	acceptedResultIds: z.array(z.string().uuid()).nullable().optional().describe(
		"Optional final accepted set; when omitted the saved review set (else the submitter's set) applies."
	)
});

/** Api.Dtos.DiscoverySubmissionCommandResponse — command outcome for review (202) / apply (200, 500 on ApplyFailed). Not the read model. */
export const discoverySubmissionCommandResponseSchema = z.object({
	submissionId: z.string().uuid(),
	status: discoverySubmissionStatusSchema,
	etag: z.string().nullable().optional().describe("New concurrency token."),
	addedBySupervisorResultIds: nullableUuidArray,
	removedBySupervisorResultIds: nullableUuidArray,
	message: z.string().nullable().optional(),
	ids: z.array(z.string().uuid()).nullable().optional().describe("Ids the command could not act on (invalid result ids, unheld reports, …). null when none."),
	outcome: discoverySubmitResponseSchema.nullable().optional().describe("Apply/retry: this run's per-result ingest outcome (same shape as the POST /discovery-curation response)."),
	itemOutcomes: z.array(discoverySubmissionItemOutcomeSchema).nullable().optional().describe("Apply/retry: cumulative per-result outcomes with failure reasons. null otherwise.")
});

/** Api.Dtos.DiscoverySubmissionRetryRequestDto — POST /discovery-submissions/{id}/retry. */
export const discoverySubmissionRetryRequestSchema = z.object({
	etag: z.string(),
	abandonResultIds: z.array(z.string().uuid()).nullable().optional().describe("Failed items to abandon instead of retrying.")
});

/** Api.Dtos.DiscoverySubmissionSetStateRequestDto — POST /discovery-submissions/{id}/state (admin). */
export const discoverySubmissionSetStateRequestSchema = z.object({
	status: z.enum(["Pending", "Applied", "ApplyFailed", "PartiallyApplied", "Released"]).describe(
		"Target DiscoverySubmissionStatus name (Azure matches case-insensitively). Applying cannot be set; None, numbers and unknown names are 400."
	),
	etag: z.string().describe("The submission's current ETag. Missing or stale is 409."),
	reason: z.string().max(4000).nullable().optional().describe("Optional, at most 4000 characters (longer is 400).")
});

/** Api.Dtos.DiscoverySubmissionReleaseRequestDto — POST /discovery-submissions/{id}/release. */
export const discoverySubmissionReleaseRequestSchema = z.object({
	etag: z.string(),
	reason: z.string().nullable().optional()
});

/** Api.Dtos.DiscoveryReportReleaseRequestDto — POST /discovery-reports/{id}/release (admin). */
export const discoveryReportReleaseRequestSchema = z.object({
	reason: z.string().nullable().optional().describe("Logged.")
});

/** Api.Dtos.DiscoveryReportReleaseResponse — admin stuck-report release command outcome. */
export const discoveryReportReleaseResponseSchema = z.object({
	documentId: z.string().uuid(),
	status: z.enum(["Released", "Conflict", "NotFound", "Forbidden"]),
	message: z.string().nullable().optional(),
	submissionIds: z.array(z.string().uuid()).nullable().optional().describe("On conflict: live submission ids still holding the report.")
});

/** Api.Dtos.PublishHomepageResponse */
export const publishHomepageResponseSchema = z.object({
	homepagePublished: z.boolean(),
	preProcessedHomepagePublished: z.boolean().optional().nullable()
});

/** Api.Dtos.PodcastRenameResponse */
export const podcastRenameResponseSchema = z.object({
	indexState: searchIndexerStateSchema
});

/** Api.Dtos.IndexPodcastResponse */
export const indexPodcastResponseSchema = z.object({
	indexedEpisodes: z.array(z.object({
		podcastId: z.string().uuid(),
		episodeId: z.string().uuid(),
		spotify: z.boolean(),
		apple: z.boolean(),
		youtube: z.boolean(),
		subjects: z.array(z.string())
	})).optional().nullable(),
	indexStatus: z.string(),
	searchIndexerState: searchIndexerStateSchema.optional()
});

/** Api.Dtos.IndexerStateDto */
export const indexerStateDtoSchema = z.object({
	state: z.string(),
	nextRun: z.string().optional().nullable(),
	lastRan: z.string().optional().nullable()
});

const submitUrlItemStateSchema = z.enum([
	"None",
	"Created",
	"Enriched",
	"Ignored",
	"EpisodeAlreadyExists"
]);

/** Api.Dtos.SubmitUrlResponse */
export const submitUrlResponseSchema = z.object({
	success: z.object({
		episode: submitUrlItemStateSchema,
		episodeId: z.string().uuid().optional().nullable(),
		podcastId: z.string().uuid().optional().nullable(),
		podcast: submitUrlItemStateSchema,
		contentKind: z.enum(["Episode", "TvShowEpisode", "Film", "NewsReport"])
			.optional()
			.nullable()
			.describe(
				"Azure catalogue persist kind (Episode, TvShowEpisode, Film, NewsReport). The Worker proxies this field and does not parse the 200 body."
			),
		playableId: z.string().uuid()
			.optional()
			.nullable()
			.describe(
				"Azure persist playable id (UUID). The Worker proxies this field and does not parse the 200 body."
			),
		episodeDetails: z.object({
			spotify: z.boolean(),
			apple: z.boolean(),
			youtube: z.boolean(),
			extraServiceKeys: z.array(streamingServiceKeySchema)
				.optional()
				.nullable()
				.describe(
					"Streaming ServiceKeys on the episode (bbcIplayer, vimeo, tubi, …). Spotify/Apple/YouTube stay the named booleans."
				),
			subjects: z.array(z.string()).optional().nullable(),
			people: z.array(z.string()).optional().nullable(),
			guestSuggestions: z.array(z.object({
				name: z.string(),
				matchResults: z.array(z.object({
					term: z.string(),
					matches: z.number()
				}))
			})).optional().nullable()
		}).optional().nullable()
	}).optional().nullable(),
	error: z.string().optional().nullable()
});

/** Delete episode 400 body when a tweeted episode blocks delete. */
export const episodeDeleteBlockedSchema = z.object({
	message: z.string().optional(),
	tweeted: z.boolean().optional()
});

/** R2 `subjects` publish — SubjectsPublisher serialises name-only rows. */
export const subjectsNameListResponseSchema = z.array(z.object({
	name: z.string()
}));

/** ContentPublisher DiscoveryInfo (R2 `discovery-info`). */
export const discoveryInfoResponseSchema = z.object({
	documentCount: z.number(),
	numberOfResults: z.number().optional().nullable(),
	discoveryBegan: isoDateTime.optional().nullable()
});

/** Worker IPageDetails / getPageDetails. */
export const pageDetailsResponseSchema = z.object({
	title: z.string().optional(),
	description: z.string().optional(),
	releaseDate: z.string().optional(),
	duration: z.string().optional(),
	/** Api `/og-image` URL (Satori composed card) when share art exists; crawlers may fall back to source. */
	image: z.string().url().optional(),
	/** Canvas aspect for `/og-image` (wide vs square art). Website uses `summary_large_image` for both when episode art is shown. */
	imageAspect: z.enum(["wide", "square"]).optional()
});

/** Query string for `GET /og-image` (page-details `image` / og:image). */
export const ogImageQuerySchema = z.object({
	u: z.string().url().describe("HTTPS episode art URL (allowlisted host)"),
	a: z.enum(["wide", "square"]).optional().describe("Canvas aspect; omitted defaults to square"),
	t: z.string().optional().describe("Episode title"),
	p: z.string().optional().describe("Show name"), // pragma: allowlist secret
	d: z.string().optional().describe("Duration display (`51 min` / `1h 24m`)"),
	r: z.string().optional().describe("Release date display (`24 Aug 2026`)"),
	pl: z.string().optional().describe("Platform chips, comma-separated (`youtube,spotify,apple,bbc`)"),
	wl: z
		.enum(["footer", "columns", "stack", "inline"])
		.optional()
		.describe("Wide chrome preview only; page-details omits this (default columns)")
});

/**
 * Azure Search hit — EpisodeSearchRecord camelCase fields returned to clients
 * (hidden search-term fields omitted).
 */
export const episodeSearchHitSchema = z.object({
	id: z.string(),
	episodeTitle: z.string(),
	podcastName: z.string(),
	episodeDescription: z.string(),
	release: isoDateTime,
	duration: z.string(),
	spotifyId: z.string().optional().nullable(),
	appleId: z.string().optional().nullable(),
	podcastAppleId: z.string().optional().nullable(),
	youtubeId: z.string().optional().nullable(),
	bbc: z.string().optional(),
	internetArchive: z.string().optional(),
	subjects: z.array(z.string()).optional(),
	image: z.string().optional().nullable(),
	"@search.score": z.number().optional()
});

/** Azure Search POST response (worker strips @odata.context). */
export const searchResponseSchema = z.object({
	"@odata.count": z.number().optional(),
	value: z.array(episodeSearchHitSchema)
});

/**
 * R2 `homepage` — RedditPodcastPoster.Models.HomePage.HomePageModel /
 * RecentEpisode (camelCase; TimeSpan as string).
 */
export const homepageEpisodeSchema = z.object({
	id: z.string().uuid(),
	episodeId: z.string().uuid().optional(),
	podcastName: z.string(),
	episodeTitle: z.string(),
	episodeDescription: z.string(),
	length: z.string().optional(),
	duration: z.string(),
	release: isoDateTime,
	releaseDayDisplay: z.string().optional(),
	ids: episodeIdsSchema.optional().nullable(),
	services: episodeServicesSchema.optional().nullable(), // pragma: allowlist secret
	/** Leftover named URL slots until the feed object is republished. */
	spotify: z.string().url().optional().nullable(),
	apple: z.string().url().optional().nullable(),
	youtube: z.string().url().optional().nullable(),
	bbc: z.string().url().optional().nullable(),
	internetArchive: z.string().url().optional().nullable(),
	subjects: z.array(z.string()).optional().nullable(),
	image: z.string().url().optional().nullable(),
	/** IETF language tag; omitted/absent for English. */
	language: z.string().optional().nullable()
});

export const homepageResponseSchema = z.object({
	recentEpisodes: z.array(homepageEpisodeSchema),
	episodeCount: z.number(),
	totalDuration: z.string()
});

export const searchSuggestionEntrySchema = z.object({
	type: z.enum(["subject", "podcast"]),
	canonical: z.string(),
	searchText: z.string(),
	alias: z.string().optional().nullable()
});

/** R2 `search-suggestions` — flat typeahead match index. */
export const searchSuggestionsResponseSchema = z.object({
	generatedAtUtc: isoDateTime,
	entries: z.array(searchSuggestionEntrySchema)
});

/**
 * R2 `homepage-ssr` (PreProcessedHomepageKey) —
 * RedditPodcastPoster.Models.HomePage.PreProcessedHomePageModel (JSON, not HTML).
 */
export const preProcessedHomepageResponseSchema = z.object({
	totalDurationDays: z.number(),
	episodesByDay: z.record(z.string(), z.array(homepageEpisodeSchema)),
	hasNext: z.boolean(),
	episodesThisWeek: z.number(),
	episodeCount: z.number()
});

export const tvShowDtoSchema = z.object({
	id: z.string().uuid(),
	name: z.string(),
	imdb: z.string().url().optional().nullable(),
	tvdb: z.string().url().optional().nullable()
});

export const tvShowEpisodeDtoSchema = z.object({
	id: z.string().uuid(),
	tvShowId: z.string().uuid(),
	title: z.string(),
	imdb: z.string().url().optional().nullable(),
	tvdb: z.string().url().optional().nullable()
});

export const tvShowChangeRequestSchema = z.object({
	imdb: z.string().optional().nullable(),
	tvdb: z.string().optional().nullable()
});

/** Same Azure `TvShowChangeRequest` wire shape (imdb/tvdb strings). Distinct object so Swagger is kind-accurate. */
export const tvShowEpisodeChangeRequestSchema = z.object({
	imdb: z.string().optional().nullable(),
	tvdb: z.string().optional().nullable()
});

export const filmDtoSchema = z.object({
	id: z.string().uuid(),
	name: z.string(),
	imdb: z.string().url().optional().nullable()
});

export const filmChangeRequestSchema = z.object({
	imdb: z.string().optional().nullable()
});
