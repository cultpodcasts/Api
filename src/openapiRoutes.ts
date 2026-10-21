import { contentJson } from "chanfana";
import { z } from "zod";
import {
	adminAuth,
	authResponses,
	ambiguousCatalogueNameConflict,
	ambiguousNewsOrganisationNameConflict,
	ambiguousPodcastNameConflict,
	bookmarkAuth,
	createOpenApiRoute,
	curateAuth,
	curateOrAdminAuth,
	curatePermissionsClaimAuth,
	discoverySubmissionViewAuth,
	discoverySuperviseAuth,
	discoveryReportReleaseAuth,
	signedInAuth,
	submitOrCurateAuth,
	episodeIdParam,
	idParam,
	identifierParam,
	nameParam,
	notFoundResponse,
	podcastAndEpisodeParam,
	pageDetailsParam,
	podcastIdAndEpisodeParam,
	serverErrorResponse
} from "./openapiRouteFactory";
import {
	GetPodcastByNameAndEpisodeIdRoute,
	GetPodcastByNameRoute,
	SubmitLookupRoute,
	SubmitPrepareRoute,
	SubmitRoute
} from "./openapiSubmitPodcastRoutes";
import { streamingScrapeSurvey } from "./streamingScrapeSurvey";
import { addBookmark } from "./addBookmark";
import { createPerson } from "./createPerson";
import { createSubject } from "./createSubject";
import { deleteBookmark } from "./deleteBookmark";
import { deletePodcastEpisode } from "./deleteEpisode";
import { getBookmarks } from "./getBookmarks";
import { getDiscoveryInfo } from "./getDiscoveryInfo";
import { getDiscoveryReports } from "./getDiscoveryReports";
import {
	getDiscoverySubmission,
	getDiscoverySubmissions,
	postDiscoverySubmissionApply,
	postDiscoverySubmissionRelease,
	postDiscoverySubmissionRetry,
	postDiscoverySubmissionState,
	postDiscoveryReportRelease,
	putDiscoverySubmissionReview
} from "./discoverySubmissions";
import { getEpisode, getPodcastEpisode } from "./getEpisode";
import { getFlairs } from "./getFlairs";
import { getLanguages } from "./getLanguages";
import { getOutgoing } from "./getOutgoing";
import { getPageDetails } from "./getPageDetails";
import { getOgShareImage } from "./ogShareImage";
import { getOgShareImageOpenApiSchema } from "./ogShareImageOpenApi";
import { getPersonByName } from "./getPersonByName";
import { getSubjectByName } from "./getSubjectByName";
import { getPeople } from "./getPeople";
import { getSubjects } from "./getSubjects";
import { homepage } from "./homepage";
import { homepageSsr } from "./homepageSsr";
import { searchSuggestions } from "./searchSuggestions";
import { indexPodcastByName } from "./indexPodcastByName";
import {
	bookmarksListResponseSchema,
	discoveryCurationResponseSchema,
	discoverySubmissionApplyRequestSchema,
	discoverySubmissionCommandResponseSchema,
	discoverySubmissionDetailResponseSchema,
	discoverySubmissionListResponseSchema,
	discoverySubmissionReviewRequestSchema,
	discoverySubmissionRetryRequestSchema,
	discoverySubmissionSetStateRequestSchema,
	discoverySubmissionReleaseRequestSchema,
	discoveryReportReleaseRequestSchema,
	discoveryReportReleaseResponseSchema,
	discoverySubmissionHeldResponseSchema,
	discoverySubmitConflictSchema,
	discoverySubmitBadRequestSchema,
	discoveryInfoResponseSchema,
	discoveryScheduleResponseSchema,
	discoveryScheduleUpdateRequestSchema,
	supportedLanguagesResponseSchema,
	supportedLanguageAddRequestSchema,
	neutralCulturesResponseSchema,
	languageTitleCasingRulesResponseSchema,
	titleCasingRulesAddLowerCaseTermRequestSchema,
	titleCasingRulesAddIgnoredSubjectRequestSchema,
	titleCasingRulesKnownTermRequestSchema,
	discoverySubmitRequestSchema,
	discoverySubmitResponseSchema,
	episodeChangeRequestSchema,
	episodeDeleteBlockedSchema,
	episodeDtoSchema,
	episodeListResponseSchema,
	episodePublishRequestSchema,
	episodePublishResponseSchema,
	episodeUpdateResponseSchema,
	errorSchema,
	flairsResponseSchema,
	homepageResponseSchema,
	preProcessedHomepageResponseSchema,
	searchSuggestionsResponseSchema,
	indexPodcastResponseSchema,
	indexerStateDtoSchema,
	jsonBody,
	languagesResponseSchema,
	messageResponseSchema,
	pageDetailsResponseSchema,
	peopleListResponseSchema,
	personChangeRequestSchema,
	personDtoSchema,
	podcastChangeRequestSchema,
	podcastDtoSchema,
	podcastKindTransferRequestSchema,
	podcastKindTransferResponseSchema,
	podcastRenameRequestSchema,
	catalogueRenameRequestSchema,
	catalogueRenameResponseSchema,
	podcastRenameResponseSchema,
	publicEpisodeDtoSchema,
	publishHomepageResponseSchema,
	pushSubscriptionRequestSchema,
	searchRequestSchema,
	searchResponseSchema,
	subjectChangeRequestSchema,
	subjectDtoSchema,
	subjectsNameListResponseSchema,
	tvShowChangeRequestSchema,
	tvShowDtoSchema,
	tvShowEpisodeChangeRequestSchema,
	tvShowEpisodeDtoSchema,
	filmChangeRequestSchema,
	filmDtoSchema,
	newsOrganisationChangeRequestSchema,
	serviceIdConflictSchema,
	newsOrganisationDtoSchema,
	newsReportChangeRequestSchema,
	newsReportDtoSchema,
	notFoundIdSchema
} from "./openapiSchemas";
import { publicGetEpisode } from "./publicGetEpisode";
import { publishPodcastEpisode } from "./publish";
import { publishHomepage } from "./publishHomepage";
import { getDiscoverySchedule, putDiscoverySchedule } from "./discoverySchedule";
import { getSupportedLanguages, getNeutralCultures, postSupportedLanguages, deleteSupportedLanguages } from "./supportedLanguages";
import {
	getTitleCasingRulesByLanguage,
	postTitleCasingRulesLowerCaseTerm,
	deleteTitleCasingRulesLowerCaseTerm,
	putTitleCasingRulesKnownTerm,
	deleteTitleCasingRulesKnownTerm,
	postTitleCasingRulesIgnoredSubject,
	deleteTitleCasingRulesIgnoredSubject
} from "./titleCasingRules";
import { appendHeroCurationEpisodes, deleteHeroCurationEpisodes, getHeroCuration, putHeroCuration } from "./heroCuration";
import {
	appendHeroCurationEpisodesOpenApiSchema,
	deleteHeroCurationEpisodesOpenApiSchema,
	getHeroCurationOpenApiSchema,
	putHeroCurationOpenApiSchema
} from "./heroCurationOpenApi";
import { pushSubscription } from "./pushSubscription";
import { renamePodcast } from "./renamePodcast";
import { renameFilm, renameNewsOrganisation, renameTvShow } from "./renameCatalogue";
import { runSearchIndexer } from "./runSearchIndexer";
import { search } from "./search";
import { submitDiscovery } from "./submitDiscovery";
import { updatePodcastEpisode } from "./updateEpisode";
import { updatePerson } from "./updatePerson";
import { updatePodcast } from "./updatePodcast";
import { transferPodcastKind } from "./transferPodcastKind";
import { updateSubject } from "./updateSubject";
import { getTvShow } from "./getTvShow";
import { updateTvShow } from "./updateTvShow";
import { getTvShowEpisode } from "./getTvShowEpisode";
import { updateTvShowEpisode } from "./updateTvShowEpisode";
import { getFilm } from "./getFilm";
import { updateFilm } from "./updateFilm";
import { getNewsOrganisation } from "./getNewsOrganisation";
import { updateNewsOrganisation } from "./updateNewsOrganisation";
import { getNewsReport } from "./getNewsReport";
import { updateNewsReport } from "./updateNewsReport";

export { GetPodcastByNameAndEpisodeIdRoute, GetPodcastByNameRoute, SubmitLookupRoute, SubmitPrepareRoute, SubmitRoute };

export const GetTvShowRoute = createOpenApiRoute(getTvShow, {
	auth: curateAuth,
	schema: {
		tags: ["Catalogue"],
		summary: "Get TV show by id or name",
		request: { params: identifierParam },
		responses: {
			200: { description: "TV show", ...contentJson(tvShowDtoSchema) },
			409: ambiguousCatalogueNameConflict,
			...notFoundResponse,
			...serverErrorResponse,
			...authResponses
		}
	}
});

export const GetTvShowEpisodeRoute = createOpenApiRoute(getTvShowEpisode, {
	auth: curateAuth,
	schema: {
		tags: ["Catalogue"],
		summary: "Get TV-show episode by id",
		request: { params: idParam },
		responses: {
			200: { description: "TV-show episode", ...contentJson(tvShowEpisodeDtoSchema) },
			...notFoundResponse,
			...serverErrorResponse,
			...authResponses
		}
	}
});

export const UpdateTvShowEpisodeRoute = createOpenApiRoute(updateTvShowEpisode, {
	auth: curateAuth,
	schema: {
		tags: ["Catalogue"],
		summary: "Patch TV-show episode fields and IMDb/TheTVDB identity URIs",
		description:
			"`id` is the episode guid. Omitted or null fields are unchanged. Same playable fields and rules as `PATCH /newsreport/{id}`, " +
			"including `guests`, plus `imdb` / `tvdb`. The request is validated before anything is applied. " +
			"`removed: true` also deletes the episode's search document (RPP #1053)." +
			" Post status follows the episode edit API: `posted` sets the flag; `tweeted` true → false deletes the tweet; `unBluesky: true` deletes the Bluesky post. The 202 body is the episode `EpisodeUpdateResponse` (`tweetDeleted`, `blueskyPostDeleted`).",
		request: { params: idParam, body: jsonBody(tvShowEpisodeChangeRequestSchema) },
		responses: {
			202: { description: "TV-show episode updated; social-retraction outcome", ...contentJson(episodeUpdateResponseSchema) },
			400: {
				description: "Invalid URL, release (yyyy-MM-dd only) or duration (non-negative h:mm:ss); nothing applied",
				...contentJson(errorSchema)
			},
			...notFoundResponse,
			...serverErrorResponse,
			...authResponses
		}
	}
});

export const UpdateTvShowRoute = createOpenApiRoute(updateTvShow, {
	auth: curateAuth,
	schema: {
		tags: ["Catalogue"],
		summary: "Patch TV show publisher fields and IMDb/TheTVDB identity URIs",
		description:
			"`id` is the show guid. Omitted or null fields are unchanged. Same publisher fields, service ids and rules as `PATCH /newsorganisation/{id}`, " +
			"plus `imdb` / `tvdb`. `searchTerms`, `language` and `removed` are also copied to every episode of the show (RPP #1053). " +
			"`removed` cascades like a podcast removal: each episode's `parentRemoved` is set / cleared (its own `removed` is untouched) " +
			"and on removal every episode's search document is deleted; restored episodes are re-added by the next indexer run.",
		request: { params: idParam, body: jsonBody(tvShowChangeRequestSchema) },
		responses: {
			202: { description: "TV show updated (empty body)" },
			400: { description: "Invalid URL", ...contentJson(errorSchema) },
			409: {
				description: "A `youTubeChannelId`, `spotifyId` or `appleId` is already owned by another news organisation / TV show or by a podcast; `ids` names the owner(s). Nothing applied",
				...contentJson(serviceIdConflictSchema)
			},
			...notFoundResponse,
			500: {
				description: "Update failed (e.g. the removal cascade's search delete failed); safe to retry the same PATCH",
				...contentJson(errorSchema)
			},
			...authResponses
		}
	}
});

export const GetFilmRoute = createOpenApiRoute(getFilm, {
	auth: curateAuth,
	schema: {
		tags: ["Catalogue"],
		summary: "Get film by id or name",
		request: { params: identifierParam },
		responses: {
			200: { description: "Film", ...contentJson(filmDtoSchema) },
			409: ambiguousCatalogueNameConflict,
			...notFoundResponse,
			...serverErrorResponse,
			...authResponses
		}
	}
});

export const UpdateFilmRoute = createOpenApiRoute(updateFilm, {
	auth: curateAuth,
	schema: {
		tags: ["Catalogue"],
		summary: "Patch film publisher and playable fields and IMDb identity URI",
		description:
			"`id` is the film guid. Omitted or null fields are unchanged. Accepts the publisher fields of `PATCH /newsorganisation/{id}` " +
			"(including `publisher`, `description` and `removed`; no propagation), plus `release` (`yyyy` or `yyyy-MM-dd`), `duration`, `explicit`, `ignored`, " +
			"`subjects`, `guests` and `imdb`. The request is validated before anything is applied. `removed: true` also deletes the film's search document (RPP #1053)." +
			" Post status follows the episode edit API: `posted` sets the flag; `tweeted` true → false deletes the tweet; `unBluesky: true` deletes the Bluesky post. The 202 body is the episode `EpisodeUpdateResponse` (`tweetDeleted`, `blueskyPostDeleted`).",
		request: { params: idParam, body: jsonBody(filmChangeRequestSchema) },
		responses: {
			202: { description: "Film updated; social-retraction outcome", ...contentJson(episodeUpdateResponseSchema) },
			400: {
				description: "Invalid URL, release (yyyy or yyyy-MM-dd) or duration (non-negative h:mm:ss); nothing applied",
				...contentJson(errorSchema)
			},
			...notFoundResponse,
			...serverErrorResponse,
			...authResponses
		}
	}
});

/** News curation proxies (RPP #1053). Azure 401/404/500 bodies are forwarded, not rewritten. */
const newsNotFoundIdResponse = {
	404: { description: "No news item with that id", ...contentJson(notFoundIdSchema) }
};

export const GetNewsOrganisationRoute = createOpenApiRoute(getNewsOrganisation, {
	auth: curateAuth,
	schema: {
		tags: ["Catalogue"],
		summary: "Get news organisation by id or name",
		description:
			"`identifier` is a guid, or a name in route form (case-insensitive match, like `/tvshow/{name}`).",
		request: { params: identifierParam },
		responses: {
			200: { description: "News organisation", ...contentJson(newsOrganisationDtoSchema) },
			409: ambiguousNewsOrganisationNameConflict,
			...notFoundResponse,
			...serverErrorResponse,
			...authResponses
		}
	}
});

export const UpdateNewsOrganisationRoute = createOpenApiRoute(updateNewsOrganisation, {
	auth: curateAuth,
	schema: {
		tags: ["Catalogue"],
		summary: "Patch news organisation fields",
		description:
			"`id` is the organisation guid. Omitted or null fields are unchanged; `\"\"` clears a string and `[]` clears a list. " +
			"Editable: `publisher`, `description`, `removed`, the other publisher fields and the service ids (`youTubeChannelId`, `youTubePlaylistId`, `spotifyId`, `appleId` / `nullAppleId`, podcast rules; used by URL submission). Not `name` (rename endpoint only). Changing `searchTerms`, `language` or `removed` is copied to the organisation's reports. " +
			"`removed` cascades like a podcast removal: each report's `parentRemoved` is set / cleared (its own `removed` is untouched) and on removal " +
			"every report's search document is deleted; restored reports are re-added by the next indexer run.",
		request: { params: idParam, body: jsonBody(newsOrganisationChangeRequestSchema) },
		responses: {
			202: { description: "News organisation updated (empty body)" },
			400: { description: "Invalid request", ...contentJson(errorSchema) },
			409: {
				description: "A `youTubeChannelId`, `spotifyId` or `appleId` is already owned by another news organisation / TV show or by a podcast; `ids` names the owner(s). Nothing applied",
				...contentJson(serviceIdConflictSchema)
			},
			...newsNotFoundIdResponse,
			500: {
				description: "Update failed (e.g. the removal cascade's search delete failed); safe to retry the same PATCH",
				...contentJson(errorSchema)
			},
			...authResponses
		}
	}
});

export const GetNewsReportRoute = createOpenApiRoute(getNewsReport, {
	auth: curateAuth,
	schema: {
		tags: ["Catalogue"],
		summary: "Get news report by id",
		request: { params: idParam },
		responses: {
			200: { description: "News report", ...contentJson(newsReportDtoSchema) },
			...notFoundResponse,
			...serverErrorResponse,
			...authResponses
		}
	}
});

export const UpdateNewsReportRoute = createOpenApiRoute(updateNewsReport, {
	auth: curateAuth,
	schema: {
		tags: ["Catalogue"],
		summary: "Patch news report fields",
		description:
			"`id` is the report guid. Omitted or null fields are unchanged. The request is validated before anything is applied. " +
			"`removed: true` also deletes the report's search document. `guests` follows the episode rule: it replaces the list, `[]` clears it, " +
			"blank names are dropped and names trimmed." +
			" Post status follows the episode edit API: `posted` sets the flag; `tweeted` true → false deletes the tweet; `unBluesky: true` deletes the Bluesky post. The 202 body is the episode `EpisodeUpdateResponse` (`tweetDeleted`, `blueskyPostDeleted`).",
		request: { params: idParam, body: jsonBody(newsReportChangeRequestSchema) },
		responses: {
			202: { description: "News report updated; social-retraction outcome", ...contentJson(episodeUpdateResponseSchema) },
			400: {
				description: "Invalid release (yyyy-MM-dd only) or duration (non-negative h:mm:ss); nothing applied",
				...contentJson(errorSchema)
			},
			...newsNotFoundIdResponse,
			...serverErrorResponse,
			...authResponses
		}
	}
});

export const HomepageRoute = createOpenApiRoute(homepage, {
    schema: {
        tags: ["Public"],
        summary: "Get homepage payload",
        responses: {
            200: { description: "Homepage JSON (R2)", ...contentJson(homepageResponseSchema) },
            404: { description: "Homepage object missing" }
        }
    }
});

export const HomepageSsrRoute = createOpenApiRoute(homepageSsr, {
    schema: {
        tags: ["Public"],
        summary: "Get pre-processed homepage JSON",
        description:
            "Returns R2 key `homepage-ssr` (ContentOptions.PreProcessedHomepageKey): " +
            "PreProcessedHomePageModel JSON grouped by day. Despite the path name, this is application/json, not HTML. " +
            "Use `GET /homepage` for the flat HomePageModel (`recentEpisodes`).",
        responses: {
            200: {
                description: "PreProcessedHomePageModel — episodesByDay, totals",
                ...contentJson(preProcessedHomepageResponseSchema)
            },
            404: { description: "Pre-processed homepage object missing from R2" }
        }
    }
});

export const SearchSuggestionsRoute = createOpenApiRoute(searchSuggestions, {
    schema: {
        tags: ["Public"],
        summary: "Get search typeahead match index",
        description:
            "Returns R2 key `search-suggestions` (ContentOptions.SearchSuggestionsKey): " +
            "flat match index of subject names/aliases and podcast names for Flix typeahead.",
        responses: {
            200: {
                description: "Search suggestions corpus",
                ...contentJson(searchSuggestionsResponseSchema)
            },
            404: { description: "Search-suggestions object missing from R2" }
        }
    }
});

export const GetSubjectsRoute = createOpenApiRoute(getSubjects, {
    auth: curatePermissionsClaimAuth,
    schema: {
        tags: ["Subjects"],
        summary: "List subjects",
        responses: {
            200: { description: "Subjects (R2 name list)", ...contentJson(subjectsNameListResponseSchema) },
            404: { description: "Subjects list is missing" },
            ...authResponses
        }
    }
});

export const GetPeopleRoute = createOpenApiRoute(getPeople, {
    auth: curatePermissionsClaimAuth,
    schema: {
        tags: ["People"],
        summary: "List people",
        responses: {
            200: { description: "People", ...contentJson(peopleListResponseSchema) },
            404: { description: "People list is missing" },
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const GetPersonByNameRoute = createOpenApiRoute(getPersonByName, {
    auth: curateAuth,
    schema: {
        tags: ["People"],
        summary: "Get person by name",
        request: { params: nameParam },
        responses: {
            200: { description: "Person", ...contentJson(personDtoSchema) },
            ...notFoundResponse,
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const UpdatePersonRoute = createOpenApiRoute(updatePerson, {
    auth: curateAuth,
    schema: {
        tags: ["People"],
        summary: "Patch person by id",
        request: { params: idParam, body: jsonBody(personChangeRequestSchema) },
        responses: {
            202: { description: "Person updated (empty body)" },
            ...notFoundResponse,
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const CreatePersonRoute = createOpenApiRoute(createPerson, {
    auth: curateAuth,
    schema: {
        tags: ["People"],
        summary: "Create person",
        request: { body: jsonBody(personChangeRequestSchema) },
        responses: {
            202: { description: "Person created (empty body)" },
            400: { description: "Validation error", ...contentJson(errorSchema) },
            409: { description: "Conflict", ...contentJson(errorSchema) },
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const GetFlairsRoute = createOpenApiRoute(getFlairs, {
    auth: curatePermissionsClaimAuth,
    schema: {
        tags: ["Subjects"],
        summary: "List flairs",
        responses: {
            200: { description: "Flairs", ...contentJson(flairsResponseSchema) },
            404: { description: "Flairs list is missing" },
            ...authResponses
        }
    }
});

export const SearchRoute = createOpenApiRoute(search, {
    schema: {
        tags: ["Search"],
        summary: "Search episodes",
        request: { body: jsonBody(searchRequestSchema) },
        responses: { 200: { description: "Search results", ...contentJson(searchResponseSchema) } }
    }
});

export const GetEpisodeRoute = createOpenApiRoute(getEpisode, {
    auth: curateAuth,
    schema: {
        tags: ["Episodes"],
        summary: "Get episode by id (any kind)",
        description: "Resolves a podcast episode, news report, TV episode or film by id (curators also see removed items). The body is EpisodeDto plus contentKind, parentId, parentName, slug and path.",
        request: { params: idParam },
        responses: {
            200: { description: "Episode, news report, TV episode or film", ...contentJson(episodeDtoSchema) },
            ...notFoundResponse,
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const GetPodcastEpisodeRoute = createOpenApiRoute(getPodcastEpisode, {
    auth: curateAuth,
    schema: {
        tags: ["Episodes"],
        summary: "Get podcast episode by podcast name and episode id",
        request: { params: podcastAndEpisodeParam },
        responses: {
            200: { description: "Episode", ...contentJson(episodeDtoSchema) },
            ...notFoundResponse,
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const UpdatePodcastEpisodeRoute = createOpenApiRoute(updatePodcastEpisode, {
    auth: curateAuth,
    schema: {
        tags: ["Episodes"],
        summary: "Patch podcast episode by podcast id and episode id",
        request: { params: podcastIdAndEpisodeParam, body: jsonBody(episodeChangeRequestSchema) },
        responses: {
            202: { description: "Accepted", ...contentJson(episodeUpdateResponseSchema) },
            ...notFoundResponse,
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const DeletePodcastEpisodeRoute = createOpenApiRoute(deletePodcastEpisode, {
    auth: adminAuth,
    schema: {
        tags: ["Episodes"],
        summary: "Delete podcast episode by podcast id and episode id",
        request: { params: podcastIdAndEpisodeParam },
        responses: {
            200: { description: "Deleted (empty body)" },
            400: { description: "Delete blocked when episode is tweeted", ...contentJson(episodeDeleteBlockedSchema) },
            409: { description: "Conflict" },
            ...notFoundResponse,
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const PublishPodcastEpisodeRoute = createOpenApiRoute(publishPodcastEpisode, {
    auth: curateAuth,
    schema: {
        tags: ["Publishing"],
        summary: "Publish podcast episode by podcast id and episode id",
        request: { params: podcastIdAndEpisodeParam, body: jsonBody(episodePublishRequestSchema) },
        responses: {
            200: { description: "Published", ...contentJson(episodePublishResponseSchema) },
            400: { description: "Publish outcome with failure details", ...contentJson(episodePublishResponseSchema) },
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const GetOutgoingRoute = createOpenApiRoute(getOutgoing, {
    auth: curateAuth,
    schema: {
        tags: ["Episodes"],
        summary: "Get outgoing episodes",
        responses: {
            200: { description: "Outgoing episodes", ...contentJson(episodeListResponseSchema) },
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const TransferPodcastKindRoute = createOpenApiRoute(transferPodcastKind, {
    auth: curateAuth,
    schema: {
        tags: ["Podcasts"],
        summary: "Transfer a podcast to a TV show or news organisation (keeps guids)",
        request: { params: idParam, body: jsonBody(podcastKindTransferRequestSchema) },
        responses: {
            202: { description: "Accepted", ...contentJson(podcastKindTransferResponseSchema) },
            400: { description: "Invalid target kind", ...contentJson(errorSchema) },
            409: { description: "Target parent already exists at this id", ...contentJson(podcastKindTransferResponseSchema) },
            ...notFoundResponse,
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const UpdatePodcastRoute = createOpenApiRoute(updatePodcast, {
    auth: curateAuth,
    schema: {
        tags: ["Podcasts"],
        summary: "Patch podcast by id",
        request: { params: idParam, body: jsonBody(podcastChangeRequestSchema) },
        responses: {
            202: { description: "Accepted (empty or indexing failure fields)" },
            ...notFoundResponse,
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const IndexPodcastByNameRoute = createOpenApiRoute(indexPodcastByName, {
    auth: curateAuth,
    schema: {
        tags: ["Podcasts"],
        summary: "Reindex podcast by name",
        request: { params: nameParam },
        responses: {
            200: { description: "Indexed", ...contentJson(indexPodcastResponseSchema) },
            400: { description: "Bad request", ...contentJson(indexPodcastResponseSchema) },
            ...notFoundResponse,
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const GetSubjectByNameRoute = createOpenApiRoute(getSubjectByName, {
    auth: curateAuth,
    schema: {
        tags: ["Subjects"],
        summary: "Get subject by name",
        request: { params: nameParam },
        responses: {
            200: { description: "Subject", ...contentJson(subjectDtoSchema) },
            ...notFoundResponse,
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const UpdateSubjectRoute = createOpenApiRoute(updateSubject, {
    auth: curateAuth,
    schema: {
        tags: ["Subjects"],
        summary: "Patch subject by id",
        request: { params: idParam, body: jsonBody(subjectChangeRequestSchema) },
        responses: {
            202: { description: "Accepted (empty body)" },
            ...notFoundResponse,
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const CreateSubjectRoute = createOpenApiRoute(createSubject, {
    auth: curateAuth,
    schema: {
        tags: ["Subjects"],
        summary: "Create subject",
        request: { body: jsonBody(subjectChangeRequestSchema) },
        responses: {
            202: { description: "Subject created (empty body)" },
            400: { description: "Validation error", ...contentJson(errorSchema) },
            409: { description: "Conflict", ...contentJson(errorSchema) },
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const GetDiscoveryReportsRoute = createOpenApiRoute(getDiscoveryReports, {
    auth: curateAuth,
    schema: {
        tags: ["Discovery"],
        summary: "Get discovery curation reports",
        responses: {
            200: { description: "Discovery reports", ...contentJson(discoveryCurationResponseSchema) },
            400: { description: "Bad request", ...contentJson(errorSchema) },
            ...notFoundResponse,
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const SubmitDiscoveryRoute = createOpenApiRoute(submitDiscovery, {
    auth: curateAuth,
    schema: {
        tags: ["Discovery"],
        summary: "Submit discovery curation",
        description: "Requires `curate`. A caller whose token also has `curate:supervised` has the submit held for a supervisor: Azure returns 202 with `{submissionId, status: \"Pending\"}` and applies nothing. Supervised curators keep `curate` (the Worker gates on it). Held submissions are reviewed and applied via `/discovery-submissions`.",
        request: { body: jsonBody(discoverySubmitRequestSchema) },
        responses: {
            200: { description: "Discovery curation applied", ...contentJson(discoverySubmitResponseSchema) },
            202: { description: "Held for supervisor review (curate:supervised caller)", ...contentJson(discoverySubmissionHeldResponseSchema) },
            400: { description: "Bad request. Supervised hold path lists `resultIds` not in the named reports.", ...contentJson(z.union([discoverySubmitBadRequestSchema, errorSchema])) },
            409: { description: "A requested report is awaiting supervisor review or otherwise not curatable; `documentIds` lists them (normal and supervised paths).", ...contentJson(discoverySubmitConflictSchema) },
            422: { description: "Unprocessable", ...contentJson(errorSchema) },
            ...notFoundResponse,
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

const submissionIdParam = z.object({ id: z.string().uuid() });
/** Submission command routes: Azure returns the command outcome (with `ids`/`message`/`etag`) on 400/404/409; Worker errors use errorSchema. */
const discoverySubmissionCommandOrError = z.union([discoverySubmissionCommandResponseSchema, errorSchema]);
const discoverySubmissionErrors = {
    400: { description: "Invalid command (e.g. result ids outside the held reports or not Failed, listed in `ids`; comment over 4000 chars; missing subject)", ...contentJson(discoverySubmissionCommandOrError) },
    404: { description: "Unknown submission", ...contentJson(discoverySubmissionCommandOrError) },
    409: { description: "Stale etag, wrong submission state, or a report no longer PendingSupervisor / concurrent apply. Nothing ingested.", ...contentJson(discoverySubmissionCommandOrError) }
};

export const GetDiscoverySubmissionsRoute = createOpenApiRoute(getDiscoverySubmissions, {
    auth: discoverySubmissionViewAuth,
    schema: {
        tags: ["Discovery"],
        summary: "List supervised discovery submissions",
        description: "`supervise`/`admin`: reviewable queue. `curate:supervised`: the caller's own submissions. Azure returns 403 for a permitted caller not allowed this view.",
        responses: {
            200: { description: "Submissions", ...contentJson(discoverySubmissionListResponseSchema) },
            400: { description: "Bad request", ...contentJson(errorSchema) },
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const GetDiscoverySubmissionRoute = createOpenApiRoute(getDiscoverySubmission, {
    auth: discoverySubmissionViewAuth,
    schema: {
        tags: ["Discovery"],
        summary: "Get a supervised discovery submission",
        description: "Submitter or an allowed supervisor/admin; otherwise 403. Returns the `etag` to send on review/apply.",
        request: { params: submissionIdParam },
        responses: {
            200: { description: "Submission with held reports and history", ...contentJson(discoverySubmissionDetailResponseSchema) },
            ...notFoundResponse,
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const PutDiscoverySubmissionReviewRoute = createOpenApiRoute(putDiscoverySubmissionReview, {
    auth: discoverySuperviseAuth,
    schema: {
        tags: ["Discovery"],
        summary: "Save a supervisor review (draft)",
        description: "Command. Saves comments and the supervisor's accepted set; nothing is ingested. Only mapped supervisors (or admin) may review; nobody but an admin may review their own submission (403).",
        request: { params: submissionIdParam, body: jsonBody(discoverySubmissionReviewRequestSchema) },
        responses: {
            202: { description: "Review saved (command outcome, not the read model; GET to rebind)", ...contentJson(discoverySubmissionCommandResponseSchema) },
            ...discoverySubmissionErrors,
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const PostDiscoverySubmissionApplyRoute = createOpenApiRoute(postDiscoverySubmissionApply, {
    auth: discoverySuperviseAuth,
    schema: {
        tags: ["Discovery"],
        summary: "Apply a supervised discovery submission",
        description: "Command. Moves held reports PendingSupervisor → Processed (all-or-nothing) then ingests the final accepted set. 200 `status` Applied or PartiallyApplied, with `outcome` (this run) and `itemOutcomes` (cumulative). Re-applying an Applied submission is a no-op 200 (`message: \"Already applied.\"`). Apply on PartiallyApplied, or ApplyFailed with outcomes, is 409 (use retry).",
        request: { params: submissionIdParam, body: jsonBody(discoverySubmissionApplyRequestSchema) },
        responses: {
            200: { description: "Applied; `outcome` carries the ingest result", ...contentJson(discoverySubmissionCommandResponseSchema) },
            ...discoverySubmissionErrors,
            500: { description: "Ingest failed: `status: \"ApplyFailed\"` and `message`; reports returned to PendingSupervisor for retry with a fresh etag. Worker failures use the error shape.", ...contentJson(z.union([discoverySubmissionCommandResponseSchema, errorSchema])) },
            ...authResponses
        }
    }
});

export const PostDiscoverySubmissionRetryRoute = createOpenApiRoute(postDiscoverySubmissionRetry, {
    auth: discoverySuperviseAuth,
    schema: {
        tags: ["Discovery"],
        summary: "Retry failed items of a supervised discovery submission",
        description: "Command. For PartiallyApplied, or ApplyFailed with `itemOutcomes`. Re-ingests Failed items; `abandonResultIds` drops them instead. Abandoning all failed items closes the submission as Applied without ingesting. 400 when abandoning an id that is not Failed (`ids`); 409 stale etag or nothing to retry.",
        request: { params: submissionIdParam, body: jsonBody(discoverySubmissionRetryRequestSchema) },
        responses: {
            200: { description: "Retried; same command outcome as apply", ...contentJson(discoverySubmissionCommandResponseSchema) },
            ...discoverySubmissionErrors,
            500: { description: "Every retried item failed (`status: \"ApplyFailed\"`, see `itemOutcomes`). Worker failures use the error shape.", ...contentJson(z.union([discoverySubmissionCommandResponseSchema, errorSchema])) },
            ...authResponses
        }
    }
});

export const PostDiscoverySubmissionReleaseRoute = createOpenApiRoute(postDiscoverySubmissionRelease, {
    auth: discoverySuperviseAuth,
    schema: {
        tags: ["Discovery"],
        summary: "Release a supervised discovery submission",
        description: "Command (never `curate:supervised`). For a submission that has ingested nothing: moves each held report PendingSupervisor → Unprocessed, sets status Released with `releasedAt`/`releaseReason`. Ingests nothing. `ids` lists reports that were not held (left unchanged). 409 stale etag or submission already ingested/terminal.",
        request: { params: submissionIdParam, body: jsonBody(discoverySubmissionReleaseRequestSchema) },
        responses: {
            200: { description: "Released", ...contentJson(discoverySubmissionCommandResponseSchema) },
            ...discoverySubmissionErrors,
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const PostDiscoverySubmissionStateRoute = createOpenApiRoute(postDiscoverySubmissionState, {
    auth: discoveryReportReleaseAuth,
    schema: {
        tags: ["Discovery"],
        summary: "Set a submission's status (admin override)",
        description: "Command. Sets `status`, clears `inProgressOperation`/`inProgressSince`, and appends a `StateChanged` history entry with `fromStatus`, `toStatus`, `actorSubject` and `reason`. Report states and item outcomes are not changed; fix those separately (e.g. POST /discovery-reports/{id}/release).",
        request: { params: submissionIdParam, body: jsonBody(discoverySubmissionSetStateRequestSchema) },
        responses: {
            200: { description: "Status set", ...contentJson(discoverySubmissionCommandResponseSchema) },
            400: { description: "Applying, None, numeric or unknown status, or reason over 4000 chars", ...contentJson(discoverySubmissionCommandOrError) },
            404: { description: "Unknown submission", ...contentJson(discoverySubmissionCommandOrError) },
            409: { description: "Missing or stale etag", ...contentJson(discoverySubmissionCommandOrError) },
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const PostDiscoveryReportReleaseRoute = createOpenApiRoute(postDiscoveryReportRelease, {
    auth: discoveryReportReleaseAuth,
    schema: {
        tags: ["Discovery"],
        summary: "Release a stuck discovery report (admin)",
        description: "Command. Releases a report stuck in PendingSupervisor with no live submission back to Unprocessed.",
        request: { params: submissionIdParam, body: jsonBody(discoveryReportReleaseRequestSchema) },
        responses: {
            200: { description: "Released", ...contentJson(discoveryReportReleaseResponseSchema) },
            400: { description: "Bad request", ...contentJson(errorSchema) },
            404: { description: "Unknown report", ...contentJson(z.union([discoveryReportReleaseResponseSchema, errorSchema])) },
            409: { description: "Report not PendingSupervisor, or still held by a live submission (`submissionIds`)", ...contentJson(z.union([discoveryReportReleaseResponseSchema, errorSchema])) },
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const GetDiscoveryInfoRoute = createOpenApiRoute(getDiscoveryInfo, {
    auth: curatePermissionsClaimAuth,
    schema: {
        tags: ["Discovery"],
        summary: "Get discovery info",
        responses: {
            200: { description: "Discovery info", ...contentJson(discoveryInfoResponseSchema) },
            404: { description: "Discovery info object is missing" },
            ...authResponses
        }
    }
});

export const RunSearchIndexerRoute = createOpenApiRoute(runSearchIndexer, {
    auth: adminAuth,
    schema: {
        tags: ["Admin"],
        summary: "Run search indexer",
        responses: {
            200: { description: "Indexer run response", ...contentJson(indexerStateDtoSchema) },
            400: { description: "Bad request", ...contentJson(indexerStateDtoSchema) },
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const PublishHomepageRoute = createOpenApiRoute(publishHomepage, {
    auth: adminAuth,
    schema: {
        tags: ["Publishing"],
        summary: "Publish homepage",
        // No request body — worker posts "{}" to Azure; PublishController has no [FromBody].
        responses: {
            200: { description: "Homepage published", ...contentJson(publishHomepageResponseSchema) },
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const GetDiscoveryScheduleRoute = createOpenApiRoute(getDiscoverySchedule, {
    auth: adminAuth,
    schema: {
        tags: ["Discovery"],
        summary: "Get Discovery UK schedule",
        responses: {
            200: { description: "Schedule", ...contentJson(discoveryScheduleResponseSchema) },
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const PutDiscoveryScheduleRoute = createOpenApiRoute(putDiscoverySchedule, {
    auth: adminAuth,
    schema: {
        tags: ["Discovery"],
        summary: "Update Discovery UK schedule",
        request: { body: jsonBody(discoveryScheduleUpdateRequestSchema) },
        responses: {
            202: { description: "Schedule updated (empty body)" },
            400: { description: "Bad request", ...contentJson(errorSchema) },
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const GetSupportedLanguagesRoute = createOpenApiRoute(getSupportedLanguages, {
    auth: adminAuth,
    schema: {
        tags: ["Admin"],
        summary: "Get supported languages config",
        responses: {
            200: { description: "Supported languages", ...contentJson(supportedLanguagesResponseSchema) },
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const GetNeutralCulturesRoute = createOpenApiRoute(getNeutralCultures, {
    auth: adminAuth,
    schema: {
        tags: ["Admin"],
        summary: "List .NET neutral culture names/codes for supported-language Add validation",
        responses: {
            200: { description: "Neutral cultures", ...contentJson(neutralCulturesResponseSchema) },
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const PostSupportedLanguagesRoute = createOpenApiRoute(postSupportedLanguages, {
    auth: adminAuth,
    schema: {
        tags: ["Admin"],
        summary: "Add one supported language by culture name",
        request: { body: jsonBody(supportedLanguageAddRequestSchema) },
        responses: {
            202: { description: "Supported language added (empty body)" },
            400: { description: "Bad request", ...contentJson(errorSchema) },
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const DeleteSupportedLanguagesRoute = createOpenApiRoute(deleteSupportedLanguages, {
    auth: adminAuth,
    schema: {
        tags: ["Admin"],
        summary: "Remove one supported language by code",
        request: { params: z.object({ code: z.string().min(1) }) },
        responses: {
            202: { description: "Supported language removed (empty body)" },
            400: { description: "Bad request", ...contentJson(errorSchema) },
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const GetTitleCasingRulesByLanguageRoute = createOpenApiRoute(getTitleCasingRulesByLanguage, {
    auth: adminAuth,
    schema: {
        tags: ["Admin"],
        summary: "Get title casing rules for a language",
        request: { params: z.object({ language: z.string().min(1) }) },
        responses: {
            200: { description: "Title casing rules for language", ...contentJson(languageTitleCasingRulesResponseSchema) },
            404: { description: "Language rules not found", ...contentJson(errorSchema) },
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const PostTitleCasingRulesLowerCaseTermRoute = createOpenApiRoute(postTitleCasingRulesLowerCaseTerm, {
    auth: adminAuth,
    schema: {
        tags: ["Admin"],
        summary: "Add one lower-case term for a language",
        request: {
            params: z.object({ language: z.string().min(1) }),
            body: jsonBody(titleCasingRulesAddLowerCaseTermRequestSchema)
        },
        responses: {
            202: { description: "Lower-case term added (empty body)" },
            400: { description: "Bad request", ...contentJson(errorSchema) },
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const DeleteTitleCasingRulesLowerCaseTermRoute = createOpenApiRoute(deleteTitleCasingRulesLowerCaseTerm, {
    auth: adminAuth,
    schema: {
        tags: ["Admin"],
        summary: "Remove one lower-case term for a language",
        request: {
            params: z.object({ language: z.string().min(1), term: z.string().min(1) })
        },
        responses: {
            202: { description: "Lower-case term removed (empty body)" },
            400: { description: "Bad request", ...contentJson(errorSchema) },
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const PutTitleCasingRulesKnownTermRoute = createOpenApiRoute(putTitleCasingRulesKnownTerm, {
    auth: adminAuth,
    schema: {
        tags: ["Admin"],
        summary: "Add or replace one known term for a language (literal in the path)",
        request: {
            params: z.object({ language: z.string().min(1), literal: z.string().min(1) }),
            body: jsonBody(titleCasingRulesKnownTermRequestSchema)
        },
        responses: {
            202: { description: "Known term saved (empty body)" },
            400: { description: "Bad request", ...contentJson(errorSchema) },
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const DeleteTitleCasingRulesKnownTermRoute = createOpenApiRoute(deleteTitleCasingRulesKnownTerm, {
    auth: adminAuth,
    schema: {
        tags: ["Admin"],
        summary: "Remove one known term for a language by literal",
        request: {
            params: z.object({ language: z.string().min(1), literal: z.string().min(1) })
        },
        responses: {
            202: { description: "Known term removed (empty body)" },
            400: { description: "Bad request", ...contentJson(errorSchema) },
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const PostTitleCasingRulesIgnoredSubjectRoute = createOpenApiRoute(postTitleCasingRulesIgnoredSubject, {
    auth: adminAuth,
    schema: {
        tags: ["Admin"],
        summary: "Add one ignored subject for a non-English language",
        request: {
            params: z.object({ language: z.string().min(1) }),
            body: jsonBody(titleCasingRulesAddIgnoredSubjectRequestSchema)
        },
        responses: {
            202: { description: "Ignored subject added (empty body)" },
            400: { description: "Bad request", ...contentJson(errorSchema) },
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const DeleteTitleCasingRulesIgnoredSubjectRoute = createOpenApiRoute(deleteTitleCasingRulesIgnoredSubject, {
    auth: adminAuth,
    schema: {
        tags: ["Admin"],
        summary: "Remove one ignored subject for a non-English language",
        request: {
            params: z.object({ language: z.string().min(1), term: z.string().min(1) })
        },
        responses: {
            202: { description: "Ignored subject removed (empty body)" },
            400: { description: "Bad request", ...contentJson(errorSchema) },
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const GetHeroCurationRoute = createOpenApiRoute(getHeroCuration, {
    schema: getHeroCurationOpenApiSchema
});

export const PutHeroCurationRoute = createOpenApiRoute(putHeroCuration, {
    auth: curateAuth,
    schema: putHeroCurationOpenApiSchema
});

export const AppendHeroCurationEpisodesRoute = createOpenApiRoute(appendHeroCurationEpisodes, {
    auth: curateAuth,
    schema: appendHeroCurationEpisodesOpenApiSchema
});

export const DeleteHeroCurationEpisodesRoute = createOpenApiRoute(deleteHeroCurationEpisodes, {
    auth: curateAuth,
    schema: deleteHeroCurationEpisodesOpenApiSchema
});

export const RenamePodcastRoute = createOpenApiRoute(renamePodcast, {
    auth: adminAuth,
    schema: {
        tags: ["Podcasts"],
        summary: "Rename podcast",
        request: { params: nameParam, body: jsonBody(podcastRenameRequestSchema) },
        responses: {
            200: { description: "Podcast renamed", ...contentJson(podcastRenameResponseSchema) },
            400: { description: "Bad request" },
            409: { description: "Conflict" },
            ...notFoundResponse,
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

function catalogueRenameSchema(tag: string, kind: string, root: string, children: string) {
    return {
        tags: [tag],
        summary: `Rename ${kind}`,
        description:
            `Admin only, like \`POST /podcast/name/:name\`. \`identifier\` is the ${kind} guid or its route-form name. ` +
            `Records the redirect \`${root}/{old}\` → \`{new}\` in the website's redirects KV (not written while another ${kind} keeps the old name), ` +
            `${children}and keeps the stored fileKey. Safe to retry.`,
        request: { params: identifierParam, body: jsonBody(catalogueRenameRequestSchema) },
        responses: {
            200: { description: `${kind[0].toUpperCase()}${kind.slice(1)} renamed; state of the immediate search update`, ...contentJson(catalogueRenameResponseSchema) },
            400: { description: "Bad request: blank `newName` or one containing `/` (Worker, Azure not called), or the redirect would loop (Azure)", ...contentJson(errorSchema) },
            409: {
                description: "Another entity of the same kind has the new name (empty body), or the identifier name is ambiguous (JSON array of guids)",
                ...contentJson(z.array(z.string().uuid()))
            },
            ...notFoundResponse,
            ...serverErrorResponse,
            ...authResponses
        }
    };
}

export const RenameNewsOrganisationRoute = createOpenApiRoute(renameNewsOrganisation, {
    auth: adminAuth,
    schema: catalogueRenameSchema("Catalogue", "news organisation", "news",
        "copies the new name onto every report's `newsOrganisationName`, patches `seriesName` in search ")
});

export const RenameTvShowRoute = createOpenApiRoute(renameTvShow, {
    auth: adminAuth,
    schema: catalogueRenameSchema("Catalogue", "TV show", "tv",
        "copies the new name onto every episode's `tvShowName`, patches `seriesName` in search ")
});

export const RenameFilmRoute = createOpenApiRoute(renameFilm, {
    auth: adminAuth,
    schema: catalogueRenameSchema("Catalogue", "film", "film", "patches the film's search `title` ")
});

export const PushSubscriptionRoute = createOpenApiRoute(pushSubscription, {
    auth: adminAuth,
    schema: {
        tags: ["Notifications"],
        summary: "Create push subscription",
        request: { body: jsonBody(pushSubscriptionRequestSchema) },
        responses: {
            200: { description: "Subscription stored (empty body)" },
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const GetPageDetailsRoute = createOpenApiRoute(getPageDetails, {
    schema: {
        tags: ["Public"],
        summary: "Get page details by podcast and episode, or for a news outlet / TV show hub",
        description:
            "`/pagedetails/{podcastName}/{episodeId}` for an episode. `/pagedetails/news/{name}` and `/pagedetails/tv/{name}` (second segment not a UUID or short id) return the hub: title = name, description = item count, image from the newest item. Caller: website server render of `/news/{name}` and `/tv/{name}` (website #530, `connectCatalogueHubSeo`).",
        request: { params: pageDetailsParam },
        responses: {
            200: { description: "Page details", ...contentJson(pageDetailsResponseSchema) },
            400: {
                description:
                    "Plain text. `No item found` (no matching episode or hub item), `Search-api error` (search upstream failed; kept as 400 to match the episode lookup), or missing params.",
                content: { "text/plain": { schema: z.string() } }
            }
        }
    }
});

export const GetOgShareImageRoute = createOpenApiRoute(getOgShareImage, {
    schema: getOgShareImageOpenApiSchema
});

export const AddBookmarkRoute = createOpenApiRoute(addBookmark, {
    auth: bookmarkAuth,
    schema: {
        tags: ["Bookmarks"],
        summary: "Save bookmark by episode id",
        request: { params: episodeIdParam },
        responses: {
            200: { description: "Bookmark saved", ...contentJson(messageResponseSchema) },
            400: { description: "Unable to create", ...contentJson(messageResponseSchema) },
            ...authResponses
        }
    }
});

export const DeleteBookmarkRoute = createOpenApiRoute(deleteBookmark, {
    auth: bookmarkAuth,
    schema: {
        tags: ["Bookmarks"],
        summary: "Delete bookmark by episode id",
        request: { params: episodeIdParam },
        responses: {
            200: { description: "Bookmark deleted", ...contentJson(messageResponseSchema) },
            400: { description: "Unable to delete", ...contentJson(messageResponseSchema) },
            ...authResponses
        }
    }
});

export const GetBookmarksRoute = createOpenApiRoute(getBookmarks, {
    auth: bookmarkAuth,
    schema: {
        tags: ["Bookmarks"],
        summary: "List current user bookmarks",
        responses: {
            200: { description: "Bookmarks", ...contentJson(bookmarksListResponseSchema) },
            500: { description: "Could not retrieve bookmarks", ...contentJson(messageResponseSchema) },
            ...authResponses
        }
    }
});

export const PublicGetEpisodeRoute = createOpenApiRoute(publicGetEpisode, {
    auth: signedInAuth,
    schema: {
        tags: ["Episodes"],
        summary: "Get episode read model by id (any kind)",
        description: "Resolves a podcast episode, news report, TV episode or film by id; 404 when it or its parent is removed. The body is PublicEpisodeDto plus contentKind, parentId, parentName, slug and path.",
        request: { params: idParam },
        responses: {
            200: { description: "Public episode, news report, TV episode or film", ...contentJson(publicEpisodeDtoSchema) },
            ...notFoundResponse,
            ...serverErrorResponse,
            ...authResponses
        }
    }
});

export const GetLanguagesRoute = createOpenApiRoute(getLanguages, {
    auth: curateOrAdminAuth,
    schema: {
        tags: ["Metadata"],
        summary: "List languages",
        responses: {
            200: { description: "Languages", ...contentJson(languagesResponseSchema) },
            404: { description: "Languages object is missing" },
            ...authResponses
        }
    }
});
export const StreamingScrapeSurveyRoute = createOpenApiRoute(streamingScrapeSurvey, {
	auth: submitOrCurateAuth,
	schema: {
		tags: ["Ops"],
		summary: "Streaming scrape survey (PoP-gated)",
		description:
			"Requires JWT submit or curate. Runs PoP preflight (cdn-cgi/trace) for each enabled CF leg; " +
			"aborts with contaminated=true if observed loc/colo is outside expectedPop. " +
			"Then surveys azure prepare, edge fetch, edge Browser Run (hydration), and US placed fetch (geo — never BR).",
		request: {
			body: jsonBody(
				z.object({
					targets: z.array(
						z.object({
							id: z.string(),
							service: z.string(),
							url: z.string().url(),
							assumedTechnique: z.string().optional()
						})
					),
					legs: z.array(z.enum(["azure", "cfFetch", "cfBr", "cfUsFetch"])).optional(),
					expectedPop: z.record(
						z.string(),
						z.object({
							locs: z.array(z.string()).optional(),
							colos: z.array(z.string()).optional()
						})
					)
				})
			)
		},
		responses: {
			200: { description: "Survey matrix" },
			409: {
				description: "Contaminated — PoP preflight failed; no catalogue rows",
				...contentJson(errorSchema)
			},
			...authResponses,
			...serverErrorResponse
		}
	}
});
