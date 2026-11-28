import type { OpenAPIRoute } from "chanfana";
import {
	AddBookmarkRoute,
	AppendHeroCurationEpisodesRoute,
	AttachEpisodeAsTrailerRoute,
	AttachEpisodeAsTvShowTrailerRoute,
	AttachEpisodeYouTubeAlternateRoute,
	BanDiscoveryChannelRoute,
	CatalogueIdentityLookupRoute,
	CreatePersonRoute,
	CreateSubjectRoute,
	DeleteBookmarkRoute,
	DeleteFilmRoute,
	DeleteHeroCurationEpisodesRoute,
	DeleteNewsOrganisationRoute,
	DeleteNewsReportRoute,
	DeletePodcastEpisodeRoute,
	DeleteSupportedLanguagesRoute,
	DeleteTitleCasingRulesIgnoredSubjectRoute,
	DeleteTitleCasingRulesKnownTermRoute,
	DeleteTitleCasingRulesLowerCaseTermRoute,
	DeleteTvShowEpisodeRoute,
	DiscoveryCurationSessionWsRoute,
	GetAwaitingApprovalRoute,
	GetBookmarksRoute,
	GetDiscoveryCurationSessionRoute,
	GetDiscoveryInfoRoute,
	GetDiscoveryReportsRoute,
	GetDiscoveryScheduleRoute,
	GetDiscoverySubmissionRoute,
	GetDiscoverySubmissionsRoute,
	GetEpisodeRoute,
	CreateFilmRoute,
	GetFilmRoute,
	GetFlairsRoute,
	GetHeroCurationRoute,
	GetLanguagesRoute,
	GetNeutralCulturesRoute,
	GetNewsOrganisationRoute,
	GetNewsReportRoute,
	GetOgShareImageRoute,
	GetOutgoingRoute,
	GetPageDetailsRoute,
	GetPeopleRoute,
	GetPersonByNameRoute,
	GetPodcastByNameAndEpisodeIdRoute,
	GetPodcastByNameRoute,
	GetPodcastEpisodeRoute,
	GetPodcastKindTransferStatusRoute,
	GetSubjectByNameRoute,
	GetSubjectsRoute,
	GetSupportedLanguagesRoute,
	GetTitleCasingRulesByLanguageRoute,
	GetTvShowEpisodeRoute,
	GetTvShowRoute,
	HomepageRoute,
	HomepageSsrRoute,
	IndexNewsOrganisationRoute,
	IndexPodcastBacklogByNameRoute,
	IndexPodcastByNameRoute,
	IndexTvShowRoute,
	MoveEpisodeToFilmRoute,
	MoveEpisodeToNewsRoute,
	MoveEpisodeToTvShowRoute,
	MoveNewsOrganisationReportsRoute,
	MoveNewsReportToFilmRoute,
	MoveNewsReportToTvShowRoute,
	MovePodcastEpisodesToNewsRoute,
	PostDiscoveryReportReleaseRoute,
	PostDiscoverySessionClearVotesRoute,
	PostDiscoverySessionIncludeRoute,
	PostDiscoverySessionSyncDocumentsRoute,
	PostDiscoverySessionVoteRoute,
	PostDiscoverySubmissionApplyRoute,
	PostDiscoverySubmissionReleaseRoute,
	PostDiscoverySubmissionRetryRoute,
	PostDiscoverySubmissionStateRoute,
	PostSupportedLanguagesRoute,
	PostTitleCasingRulesIgnoredSubjectRoute,
	PostTitleCasingRulesLowerCaseTermRoute,
	PublicGetEpisodeRoute,
	PublishEpisodeRoute,
	PublishFilmRoute,
	PublishHomepageRoute,
	PublishNewsReportRoute,
	PublishPodcastEpisodeRoute,
	PublishTvShowEpisodeRoute,
	PutDiscoveryScheduleRoute,
	PutDiscoverySubmissionReviewRoute,
	PutHeroCurationRoute,
	PutTitleCasingRulesKnownTermRoute,
	PushSubscriptionRoute,
	RenameFilmRoute,
	RenameNewsOrganisationRoute,
	RenamePodcastRoute,
	RenameTvShowRoute,
	RunSearchIndexerRoute,
	SearchAdminDocsRoute,
	SearchAdminInventoryRoute,
	SearchAdminRebuildRoute,
	SearchAdminRebuildStatusRoute,
	SearchRoute,
	SearchSuggestionsRoute,
	StreamingScrapeSurveyRoute,
	SubmitDiscoveryOutcomeRoute,
	SubmitDiscoveryRoute,
	SubmitLookupRoute,
	SubmitPrepareRoute,
	SubmitRoute,
	TransferPodcastKindRoute,
	UpdateFilmRoute,
	UpdateNewsOrganisationRoute,
	UpdateNewsReportRoute,
	UpdatePersonRoute,
	UpdatePodcastEpisodeRoute,
	UpdatePodcastRoute,
	UpdateSubjectRoute,
	UpdateTvShowEpisodeRoute,
	UpdateTvShowRoute
} from "./openapiRoutes";
import type { OpenApiAuthAnnotation } from "./openapiAuth";
import type { OpenApiAuth } from "./openapiRouteFactory";

type OpenApiRouteClass = typeof OpenAPIRoute & {
	openApiAuth?: OpenApiAuth | boolean;
	authAnnotation: OpenApiAuthAnnotation;
};

type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

export type RegisteredOpenApiRoute = {
	method: HttpMethod;
	/** Hono path as registered (may include `{.+}`). */
	path: string;
	/** OpenAPI path template (`{param}` form). */
	openApiPath: string;
	route: OpenApiRouteClass;
	authAnnotation: OpenApiAuthAnnotation;
};

type OpenApiRegistrar = {
	get: (path: string, route: unknown) => unknown;
	post: (path: string, route: unknown) => unknown;
	put: (path: string, route: unknown) => unknown;
	patch: (path: string, route: unknown) => unknown;
	delete: (path: string, route: unknown) => unknown;
};

/**
 * Chanfana turns `:name` into `{name}` and keeps a Hono regex suffix on the
 * template (`:identifier{.+}` → `{identifier}{.+}`).
 */
export function toOpenApiPath(honoPath: string): string {
	return honoPath.replace(/:([A-Za-z_][A-Za-z0-9_]*)(\{[^}]+\})?/g, "{$1}$2");
}

/**
 * Registers every Worker OpenAPI operation on a chanfana `fromHono` instance.
 * Shared by `index.ts` and OpenAPI auth contract tests (Api #255).
 */
export function registerOpenApiRoutes(openapi: OpenApiRegistrar): RegisteredOpenApiRoute[] {
	const registered: RegisteredOpenApiRoute[] = [];

	const add = (method: HttpMethod, path: string, route: OpenApiRouteClass) => {
		openapi[method](path, route);
		registered.push({
			method,
			path,
			openApiPath: toOpenApiPath(path),
			route,
			authAnnotation: route.authAnnotation
		});
	};

	add("get", "/homepage", HomepageRoute);
	add("get", "/homepage-ssr", HomepageSsrRoute);
	add("get", "/search-suggestions", SearchSuggestionsRoute);
	add("get", "/subjects", GetSubjectsRoute);
	add("get", "/people", GetPeopleRoute);
	add("get", "/person/:name", GetPersonByNameRoute);
	add("patch", "/person/:id", UpdatePersonRoute);
	add("post", "/person", CreatePersonRoute);
	add("get", "/flairs", GetFlairsRoute);
	add("post", "/search", SearchRoute);
	add("post", "/search/admin/docs", SearchAdminDocsRoute);
	add("get", "/search/admin/docs/inventory", SearchAdminInventoryRoute);
	add("get", "/search/admin/rebuild", SearchAdminRebuildStatusRoute);
	add("post", "/search/admin/rebuild/:action", SearchAdminRebuildRoute);
	add("get", "/submit/lookup", SubmitLookupRoute);
	add("post", "/submit/prepare", SubmitPrepareRoute);
	add("post", "/submit", SubmitRoute);
	add("post", "/episode/publish/:podcastId/:episodeId", PublishPodcastEpisodeRoute);
	add("post", "/episode/publish/:episodeId", PublishEpisodeRoute);
	add("post", "/film/:id/publish", PublishFilmRoute);
	add("post", "/newsreport/:id/publish", PublishNewsReportRoute);
	add("post", "/tvshowepisode/:id/publish", PublishTvShowEpisodeRoute);
	add("get", "/episode/:podcastName/:episodeId", GetPodcastEpisodeRoute);
	add("patch", "/episode/:podcastId/:episodeId", UpdatePodcastEpisodeRoute);
	add("delete", "/episode/:podcastId/:episodeId", DeletePodcastEpisodeRoute);
	add("post", "/episode/:podcastId/:episodeId/film", MoveEpisodeToFilmRoute);
	add("post", "/episode/:podcastId/:episodeId/trailer", AttachEpisodeAsTrailerRoute);
	add("post", "/episode/:podcastId/:episodeId/tvshow-trailer", AttachEpisodeAsTvShowTrailerRoute);
	add("post", "/episode/:podcastId/:episodeId/youtube-alternate", AttachEpisodeYouTubeAlternateRoute);
	add("post", "/episode/:podcastId/:episodeId/tvshow", MoveEpisodeToTvShowRoute);
	add("post", "/episode/:podcastId/:episodeId/news", MoveEpisodeToNewsRoute);
	add("get", "/episode/:id", GetEpisodeRoute);
	add("get", "/episodes/outgoing", GetOutgoingRoute);
	add("get", "/episodes/awaiting-approval", GetAwaitingApprovalRoute);
	add("get", "/podcast/:name", GetPodcastByNameRoute);
	add("get", "/podcast/:name/:id", GetPodcastByNameAndEpisodeIdRoute);
	add("post", "/podcast/:id/kind", TransferPodcastKindRoute);
	add("get", "/podcast/:id/kind", GetPodcastKindTransferStatusRoute);
	add("patch", "/podcast/:id", UpdatePodcastRoute);
	add("get", "/tvshow/:identifier{.+}", GetTvShowRoute);
	add("patch", "/tvshow/:id", UpdateTvShowRoute);
	add("get", "/tvshowepisode/:id", GetTvShowEpisodeRoute);
	add("patch", "/tvshowepisode/:id", UpdateTvShowEpisodeRoute);
	add("delete", "/tvshowepisode/:id", DeleteTvShowEpisodeRoute);
	add("post", "/film", CreateFilmRoute);
	add("get", "/film/:identifier{.+}", GetFilmRoute);
	add("patch", "/film/:id", UpdateFilmRoute);
	add("delete", "/film/:id", DeleteFilmRoute);
	add("post", "/catalogue/identity/lookup", CatalogueIdentityLookupRoute);
	add("get", "/newsorganisation/:identifier{.+}", GetNewsOrganisationRoute);
	add("patch", "/newsorganisation/:id", UpdateNewsOrganisationRoute);
	add("delete", "/newsorganisation/:id", DeleteNewsOrganisationRoute);
	add("post", "/newsorganisation/:id/reports/move", MoveNewsOrganisationReportsRoute);
	add("post", "/newsorganisation/name/:identifier{.+}", RenameNewsOrganisationRoute);
	add("post", "/tvshow/name/:identifier{.+}", RenameTvShowRoute);
	add("post", "/film/name/:identifier{.+}", RenameFilmRoute);
	add("post", "/newsorganisation/index/:identifier{.+}", IndexNewsOrganisationRoute);
	add("post", "/tvshow/index/:identifier{.+}", IndexTvShowRoute);
	add("get", "/newsreport/:id", GetNewsReportRoute);
	add("patch", "/newsreport/:id", UpdateNewsReportRoute);
	add("delete", "/newsreport/:id", DeleteNewsReportRoute);
	add("post", "/newsreport/:id/tvshow", MoveNewsReportToTvShowRoute);
	add("post", "/newsreport/:id/film", MoveNewsReportToFilmRoute);
	add("post", "/podcast/index/:name/backlog", IndexPodcastBacklogByNameRoute);
	add("post", "/podcast/index/:name", IndexPodcastByNameRoute);
	add("get", "/subject/:name", GetSubjectByNameRoute);
	add("patch", "/subject/:id", UpdateSubjectRoute);
	add("post", "/subject", CreateSubjectRoute);
	add("get", "/discovery-curation", GetDiscoveryReportsRoute);
	add("post", "/discovery-curation", SubmitDiscoveryRoute);
	add("post", "/discovery-curation/submit-outcome", SubmitDiscoveryOutcomeRoute);
	add("post", "/discovery-curation/:resultId/ban", BanDiscoveryChannelRoute);
	add("get", "/discovery-curation/session", GetDiscoveryCurationSessionRoute);
	add("post", "/discovery-curation/session/vote", PostDiscoverySessionVoteRoute);
	add("post", "/discovery-curation/session/sync-documents", PostDiscoverySessionSyncDocumentsRoute);
	add("post", "/discovery-curation/session/include", PostDiscoverySessionIncludeRoute);
	add("post", "/discovery-curation/session/clear-votes", PostDiscoverySessionClearVotesRoute);
	add("get", "/discovery-curation/session/ws", DiscoveryCurationSessionWsRoute);
	add("get", "/discovery-submissions", GetDiscoverySubmissionsRoute);
	add("get", "/discovery-submissions/:id", GetDiscoverySubmissionRoute);
	add("put", "/discovery-submissions/:id/review", PutDiscoverySubmissionReviewRoute);
	add("post", "/discovery-submissions/:id/apply", PostDiscoverySubmissionApplyRoute);
	add("post", "/discovery-submissions/:id/retry", PostDiscoverySubmissionRetryRoute);
	add("post", "/discovery-submissions/:id/release", PostDiscoverySubmissionReleaseRoute);
	add("post", "/discovery-submissions/:id/state", PostDiscoverySubmissionStateRoute);
	add("post", "/discovery-reports/:id/release", PostDiscoveryReportReleaseRoute);
	add("get", "/discovery-info", GetDiscoveryInfoRoute);
	add("post", "/searchindex/run", RunSearchIndexerRoute);
	add("post", "/publish/homepage", PublishHomepageRoute);
	add("get", "/discovery-schedule", GetDiscoveryScheduleRoute);
	add("put", "/discovery-schedule", PutDiscoveryScheduleRoute);
	add("get", "/supported-languages", GetSupportedLanguagesRoute);
	add("get", "/supported-languages/cultures", GetNeutralCulturesRoute);
	add("post", "/supported-languages", PostSupportedLanguagesRoute);
	add("delete", "/supported-languages/:code", DeleteSupportedLanguagesRoute);
	add("get", "/title-casing-rules/:language", GetTitleCasingRulesByLanguageRoute);
	add("post", "/title-casing-rules/:language/lower-case-terms", PostTitleCasingRulesLowerCaseTermRoute);
	add("delete", "/title-casing-rules/:language/lower-case-terms/:term", DeleteTitleCasingRulesLowerCaseTermRoute);
	add("put", "/title-casing-rules/:language/known-terms/:literal", PutTitleCasingRulesKnownTermRoute);
	add("delete", "/title-casing-rules/:language/known-terms/:literal", DeleteTitleCasingRulesKnownTermRoute);
	add("post", "/title-casing-rules/:language/ignored-subjects", PostTitleCasingRulesIgnoredSubjectRoute);
	add("delete", "/title-casing-rules/:language/ignored-subjects/:term", DeleteTitleCasingRulesIgnoredSubjectRoute);
	add("get", "/hero-curation", GetHeroCurationRoute);
	add("put", "/hero-curation", PutHeroCurationRoute);
	add("post", "/hero-curation/episodes", AppendHeroCurationEpisodesRoute);
	add("delete", "/hero-curation/episodes", DeleteHeroCurationEpisodesRoute);
	add("post", "/podcast/name/:name", RenamePodcastRoute);
	add("post", "/podcast/:id/news", MovePodcastEpisodesToNewsRoute);
	add("post", "/pushsubscription", PushSubscriptionRoute);
	add("get", "/pagedetails/:podcastName/:episodeId", GetPageDetailsRoute);
	add("get", "/og-image", GetOgShareImageRoute);
	add("put", "/bookmark/:episodeId", AddBookmarkRoute);
	add("delete", "/bookmark/:episodeId", DeleteBookmarkRoute);
	add("get", "/bookmarks", GetBookmarksRoute);
	add("get", "/public/episode/:id", PublicGetEpisodeRoute);
	add("get", "/languages", GetLanguagesRoute);
	add("post", "/ops/streaming-scrape-survey", StreamingScrapeSurveyRoute);

	return registered;
}
