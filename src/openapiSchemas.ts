import { z } from "zod";

/**
 * OpenAPI/Zod contracts for the Cloudflare Api worker.
 * Incremental: concrete request bodies for known Azure/DTO shapes;
 * opaque JSON for responses not yet modelled end-to-end.
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
}).passthrough();

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
	urls: z.record(z.string(), z.unknown()).optional().nullable(),
	images: z.record(z.string(), z.unknown()).optional().nullable(),
	subjects: z.array(z.string()).optional().nullable(),
	searchTerms: z.string().optional().nullable(),
	lang: z.string().optional().nullable(),
	guests: z.array(z.string()).optional().nullable()
}).passthrough();

export const personChangeRequestSchema = z.object({
	id: z.string().uuid().optional().nullable(),
	name: z.string().optional().nullable(),
	sortName: z.string().optional().nullable(),
	isOrganization: z.boolean().optional().nullable(),
	aliases: z.array(z.string()).optional().nullable(),
	twitterHandle: z.string().optional().nullable(),
	blueskyHandle: z.string().optional().nullable()
}).passthrough();

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
}).passthrough();

/** Large patch surface — document known keys; allow additional fields. */
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
}).passthrough();

/** Homepage publish / other admin blobs not yet fully modelled. */
export const opaqueObjectRequestSchema = z.record(z.string(), z.unknown());
