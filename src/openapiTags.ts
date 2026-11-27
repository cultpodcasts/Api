/**
 * OpenAPI / Swagger operation tags (Api #254).
 * One tag per catalogue kind (plus parents and cross-cutting areas).
 * Declared order is what Swagger UI uses (see docsPageHtml tagsSorter).
 */
export const OpenApiTags = {
	Public: "Public",
	Search: "Search",
	Submission: "Submission",
	Podcasts: "Podcasts",
	Episodes: "Episodes",
	Films: "Films",
	TvShows: "TV shows",
	NewsOrganisations: "News organisations",
	NewsReports: "News reports",
	People: "People",
	Subjects: "Subjects",
	Discovery: "Discovery",
	Hero: "Hero",
	Bookmarks: "Bookmarks",
	Notifications: "Notifications",
	Metadata: "Metadata",
	Ops: "Ops"
} as const;

export type OpenApiTag = (typeof OpenApiTags)[keyof typeof OpenApiTags];

/** Document / Swagger display order. */
export const OPENAPI_TAG_ORDER: readonly OpenApiTag[] = [
	OpenApiTags.Public,
	OpenApiTags.Search,
	OpenApiTags.Submission,
	OpenApiTags.Podcasts,
	OpenApiTags.Episodes,
	OpenApiTags.Films,
	OpenApiTags.TvShows,
	OpenApiTags.NewsOrganisations,
	OpenApiTags.NewsReports,
	OpenApiTags.People,
	OpenApiTags.Subjects,
	OpenApiTags.Discovery,
	OpenApiTags.Hero,
	OpenApiTags.Bookmarks,
	OpenApiTags.Notifications,
	OpenApiTags.Metadata,
	OpenApiTags.Ops
];

/** Root OpenAPI `tags` array so clients see descriptions and stable order. */
export const openApiTagDefinitions: { name: OpenApiTag; description: string }[] = [
	{ name: OpenApiTags.Public, description: "Homepage, page details, OG image, and other public reads" },
	{ name: OpenApiTags.Search, description: "Episode search and D1 search-index administration" },
	{ name: OpenApiTags.Submission, description: "URL submit, prepare, and membership lookup" },
	{ name: OpenApiTags.Podcasts, description: "Podcast parents (CRUD, index, rename, kind transfer)" },
	{ name: OpenApiTags.Episodes, description: "Podcast episodes and cross-kind episode reads / queues" },
	{ name: OpenApiTags.Films, description: "Films, film publish, and moves/attaches that target a film" },
	{ name: OpenApiTags.TvShows, description: "TV shows, TV-show episodes, publish, and moves that target a show" },
	{
		name: OpenApiTags.NewsOrganisations,
		description: "News organisations (CRUD, rename, index, report merge, empty delete)"
	},
	{
		name: OpenApiTags.NewsReports,
		description: "News reports, report publish, and moves that create a news report"
	},
	{ name: OpenApiTags.People, description: "People register" },
	{ name: OpenApiTags.Subjects, description: "Subjects and Reddit flairs" },
	{ name: OpenApiTags.Discovery, description: "Discovery curation, submissions, and schedule" },
	{ name: OpenApiTags.Hero, description: "Homepage hero list and subject rail" },
	{ name: OpenApiTags.Bookmarks, description: "Signed-in user bookmarks" },
	{ name: OpenApiTags.Notifications, description: "Push subscriptions" },
	{
		name: OpenApiTags.Metadata,
		description: "Languages, supported-language config, title-casing rules, catalogue identity lookup"
	},
	{ name: OpenApiTags.Ops, description: "Operational / gated tooling" }
];
