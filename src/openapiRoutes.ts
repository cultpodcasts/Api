import { contentJson } from "chanfana";
import { z } from "zod";
import {
	adminAuth,
	authResponses,
	ambiguousCatalogueNameConflict,
	ambiguousPodcastNameConflict,
	bookmarkAuth,
	createOpenApiRoute,
	curateAuth,
	curateOrAdminAuth,
	curatePermissionsClaimAuth,
	signedInAuth,
	submitOrCurateAuth,
	episodeIdParam,
	idParam,
	identifierParam,
	nameParam,
	notFoundResponse,
	podcastAndEpisodeParam,
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
	filmDtoSchema
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
		summary: "Patch TV-show episode IMDb/TheTVDB identity URIs",
		request: { params: idParam, body: jsonBody(tvShowEpisodeChangeRequestSchema) },
		responses: {
			202: { description: "TV-show episode updated (empty body)" },
			400: { description: "Invalid URL", ...contentJson(errorSchema) },
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
		summary: "Patch TV show IMDb/TheTVDB identity URIs",
		request: { params: idParam, body: jsonBody(tvShowChangeRequestSchema) },
		responses: {
			202: { description: "TV show updated (empty body)" },
			400: { description: "Invalid URL", ...contentJson(errorSchema) },
			...notFoundResponse,
			...serverErrorResponse,
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
		summary: "Patch film IMDb identity URI",
		request: { params: idParam, body: jsonBody(filmChangeRequestSchema) },
		responses: {
			202: { description: "Film updated (empty body)" },
			400: { description: "Invalid URL", ...contentJson(errorSchema) },
			...notFoundResponse,
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
        summary: "Get episode by id",
        request: { params: idParam },
        responses: {
            200: { description: "Episode", ...contentJson(episodeDtoSchema) },
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
        request: { body: jsonBody(discoverySubmitRequestSchema) },
        responses: {
            200: { description: "Discovery curation submitted", ...contentJson(discoverySubmitResponseSchema) },
            400: { description: "Bad request", ...contentJson(errorSchema) },
            409: { description: "Conflict", ...contentJson(errorSchema) },
            422: { description: "Unprocessable", ...contentJson(errorSchema) },
            ...notFoundResponse,
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
        summary: "Get page details by podcast and episode",
        request: { params: podcastAndEpisodeParam },
        responses: { 200: { description: "Page details", ...contentJson(pageDetailsResponseSchema) } }
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
        summary: "Get episode read model by id",
        request: { params: idParam },
        responses: {
            200: { description: "Public episode", ...contentJson(publicEpisodeDtoSchema) },
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
