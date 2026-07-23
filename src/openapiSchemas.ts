import { z } from "zod";

/**
 * OpenAPI/Zod contracts for the Cloudflare Api worker.
 * Known Azure/DTO shapes are strict objects (no `.passthrough()` / open records) so
 * Swagger examples show real fields instead of additionalProp1/2/3.
 * `opaqueJsonSchema` / `opaqueObjectRequestSchema` remain only for unmodelled blobs.
 */

/** Prefer over `z.any()` — documents "some JSON" without claiming a shape. */
export const opaqueJsonSchema = z.union([
	z.record(z.string(), z.unknown()),
	z.array(z.unknown())
]);

export const errorSchema = z.object({
	error: z.string().optional(),
	message: z.string().optional()
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

export const submitUrlRequestSchema = z.object({
	url: z.string().url(),
	podcastId: z.string().uuid().optional().nullable(),
	podcastName: z.string().optional().nullable()
});

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
		slotId: z.string(),
		slotStartUtc: z.string(),
		slotStartUk: z.string()
	}))
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

const discoveryCurationItemSchema = z.object({
	id: z.string().uuid(),
	episodeName: z.string().optional().nullable(),
	showName: z.string().optional().nullable(),
	episodeDescription: z.string().optional().nullable(),
	showDescription: z.string().optional().nullable(),
	released: z.string(),
	duration: z.string().optional().nullable(),
	urls: discoveryResultUrlsSchema,
	subjects: z.array(z.string()),
	youTubeViews: z.number().optional().nullable(),
	youTubeChannelMembers: z.number().optional().nullable(),
	imageUrl: z.string().url().optional().nullable(),
	discoverService: z.array(discoverServiceSchema),
	enrichedTimeFromApple: z.boolean(),
	enrichedUrlFromSpotify: z.boolean(),
	matchingPodcasts: z.array(discoveryMatchingPodcastSchema).optional().nullable(),
	acceptProbability: z.number().optional().nullable(),
	autoHidden: z.boolean()
});

export const discoveryCurationResponseSchema = z.object({
	ids: z.array(z.string().uuid()),
	results: z.array(discoveryCurationItemSchema),
	hiddenCount: z.number()
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

export const termSubmitRequestSchema = z.object({
	term: z.string().min(1)
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

/** ServiceUrls — Api.Dtos / RedditPodcastPoster.Models.Podcasts */
export const serviceUrlsSchema = z.object({
	spotify: z.string().url().optional().nullable(),
	apple: z.string().url().optional().nullable(),
	youtube: z.string().url().optional().nullable(),
	internetArchive: z.string().url().optional().nullable(),
	bbc: z.string().url().optional().nullable()
});

export const episodeImagesSchema = z.object({
	youtube: z.string().url().optional().nullable(),
	spotify: z.string().url().optional().nullable(),
	apple: z.string().url().optional().nullable(),
	other: z.string().url().optional().nullable()
});

export const episodeChangeRequestSchema = z.object({
	title: z.string().optional().nullable(),
	description: z.string().optional().nullable(),
	posted: z.boolean().optional().nullable(),
	tweeted: z.boolean().optional().nullable(),
	bluesky: z.boolean().optional().nullable(),
	ignored: z.boolean().optional().nullable(),
	removed: z.boolean().optional().nullable(),
	explicit: z.boolean().optional().nullable(),
	release: z.string().optional().nullable(),
	duration: z.string().optional().nullable(),
	urls: serviceUrlsSchema.optional().nullable(),
	images: episodeImagesSchema.optional().nullable(),
	subjects: z.array(z.string()).optional().nullable(),
	searchTerms: z.string().optional().nullable(),
	lang: z.string().optional().nullable(),
	guests: z.array(z.string()).optional().nullable()
});

export const personChangeRequestSchema = z.object({
	id: z.string().uuid().optional().nullable(),
	name: z.string().optional().nullable(),
	sortName: z.string().optional().nullable(),
	isOrganization: z.boolean().optional().nullable(),
	aliases: z.array(z.string()).optional().nullable(),
	twitterHandle: z.string().optional().nullable(),
	blueskyHandle: z.string().optional().nullable()
});

export const subjectChangeRequestSchema = z.object({
	id: z.string().uuid().optional().nullable(),
	aliases: z.array(z.string()).optional().nullable(),
	associatedSubjects: z.array(z.string()).optional().nullable(),
	name: z.string().optional().nullable(),
	enrichmentHashTags: z.array(z.string()).optional().nullable(),
	hashTag: z.string().optional().nullable(),
	redditFlairTemplateId: z.string().uuid().optional().nullable(),
	redditFlareText: z.string().optional().nullable(),
	subjectType: z.string().optional().nullable(),
	knownTerms: z.array(z.string()).optional().nullable()
});

/** Large patch surface — known keys only (matches PodcastDto / change request). */
export const podcastChangeRequestSchema = z.object({
	id: z.string().uuid().optional().nullable(),
	name: z.string().optional().nullable(),
	lang: z.string().optional().nullable(),
	removed: z.boolean().optional().nullable(),
	indexAllEpisodes: z.boolean().optional().nullable(),
	bypassShortEpisodeChecking: z.boolean().optional().nullable(),
	releaseAuthority: z.string().optional().nullable(),
	unsetReleaseAuthority: z.boolean().optional().nullable(),
	primaryPostService: z.string().optional().nullable(),
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

/** Unmodelled admin request blobs only. */
export const opaqueObjectRequestSchema = z.record(z.string(), z.unknown());

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
export const serviceNameSchema = z.string();

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

const episodeSubjectMatchSchema = z.object({
	subject: z.string().optional(),
	term: z.string().optional(),
	source: z.string().optional()
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
	release: z.string(),
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
	urls: serviceUrlsSchema,
	subjects: z.array(z.string()),
	removedSubjects: z.array(z.string()).optional(),
	matches: z.array(episodeSubjectMatchSchema).optional(),
	searchTerms: z.string().optional().nullable(),
	images: episodeImagesSchema.optional().nullable(),
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
	release: z.string(),
	duration: z.string(),
	explicit: z.boolean(),
	subjects: z.array(z.string()),
	urls: serviceUrlsSchema,
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
	subjectType: z.string().optional().nullable(),
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
	releaseAuthority: serviceNameSchema.optional().nullable(),
	unsetReleaseAuthority: z.boolean().optional().nullable(),
	primaryPostService: serviceNameSchema.optional().nullable(),
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
export const discoverySubmitResponseSchema = z.object({
	message: z.string(),
	errorsOccurred: z.boolean(),
	results: z.array(z.object({
		discoveryItemId: z.string().uuid(),
		podcastId: z.string().uuid().optional().nullable(),
		episodeId: z.string().uuid().optional().nullable(),
		message: z.string()
	})),
	searchIndexerState: searchIndexerStateSchema
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
		episodeDetails: z.object({
			spotify: z.boolean(),
			apple: z.boolean(),
			youtube: z.boolean(),
			bbc: z.boolean(),
			internetArchive: z.boolean(),
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

/** Delete episode 400 body when social posts block delete. */
export const episodeDeleteBlockedSchema = z.object({
	message: z.string().optional(),
	posted: z.boolean().optional(),
	tweeted: z.boolean().optional()
});
