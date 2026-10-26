# Generating OpenAPI Zod schemas from C# DTOs

The Cloudflare Api worker (`src/openapiSchemas.ts` + `src/openapiRoutes.ts`) documents JSON that **api-infra** (Azure Functions) and a few worker-local routes actually return or accept.

There is **no automated codegen today**. “Generate” means: copy the C# contract into a **strict** Zod object, wire it on the route, add a Vitest parse test, then deploy. Do **not** use `.passthrough()`, `z.any()`, or `z.record(z.string(), z.unknown())` for known DTOs — Swagger renders those as `additionalProp1/2/3`.

## Source of truth (C#)

Repo: `cultpodcasts/RedditPodcastPoster`

| Kind | Path |
|------|------|
| Response DTOs | `Cloud/Api/Dtos/*.cs` |
| Request / change models | `Cloud/Api/Models/*ChangeRequest*.cs`, `*Request*.cs` |
| Shared domain shapes | `Class-Libraries/RedditPodcastPoster.Models/**` (e.g. `ServiceUrls`, `ServiceImageUrls`, `Service`, `SubjectType`) |
| Search index hit | `Class-Libraries/RedditPodcastPoster.Search/Models/EpisodeSearchRecord.cs` |
| R2 publish models | `Class-Libraries/RedditPodcastPoster.ContentPublisher/Models/` (e.g. `DiscoveryInfo`) |
| Status codes | Handlers under `Cloud/Api/Handlers/**` + thin CF proxies in `Api/src/*.ts` (`successStatuses` / `forwardStatuses`) |

Worker-only (no Functions DTO): bookmarks Durable Object, R2 `subjects` name list, `getPageDetails` (`IPageDetails`), Azure Search envelope wrapping `EpisodeSearchRecord`.

## Workflow

1. **Find the C# type** for the route (handler → DTO / change request).
2. **Read `[JsonPropertyName("…")]`** — Zod keys must match JSON names, not C# property names (`UnBluesky` → `unBluesky`, `Language` → `lang`, `Length` → `duration`). Episode GET `BlueskyPosted` remains JSON `bluesky` on `EpisodeDto`.
3. **Map types** (table below) into a new `export const …Schema = z.object({ … })` in `src/openapiSchemas.ts`. Cite the C# type in a short JSDoc (`/** Api.Dtos.EpisodeDto */`).
4. **Wire** the schema in `src/openapiRoutes.ts` on the matching route: success status + error statuses the worker actually forwards (`proxyToAzure` options or handler returns).
5. **Test** in `tests/openapi-schemas.spec.ts` with a minimal valid fixture (and a reject case for enums if useful).
6. **Verify**: `npm test` && `npm run lint`. Optionally hard-refresh Swagger on `api.cultpodcasts.com` after deploy.

## Type mapping

| C# | Zod | Notes |
|----|-----|--------|
| `string` / `string?` | `z.string()` / `.optional().nullable()` | |
| `bool` / `bool?` | `z.boolean()` / `.optional().nullable()` | |
| `int` / `long` / `Guid` | `z.number().int()` / `z.string().uuid()` | Guids are JSON strings |
| `DateTime` / `DateTimeOffset` | `z.string()` | ISO-8601 from System.Text.Json |
| `TimeSpan` | `z.string()` | e.g. `"01:30:00"` |
| `Uri?` (response) | `z.string().url().optional().nullable()` | |
| `Uri?` on **change requests** | `z.union([z.string().url(), z.literal(""), z.null()]).optional()` | Angular clears URLs with `""` |
| `[JsonConverter(typeof(JsonStringEnumConverter))] enum` | `z.enum(["A", "B", …])` | Use **enum member names**, not numeric values (`Service`, `SubjectType`, `SearchIndexerState`) |
| Nested class / record | Nested `z.object({ … })` | Prefer a shared export (`serviceUrlsSchema`) when reused |
| Arrays | `z.array(…)` | |
| Empty body | `z.object({})` or omit body | e.g. publish homepage sends `"{}"` |

### Shared enums already in the worker

```ts
serviceEnumSchema     // Spotify | Apple | YouTube | Other
subjectTypeSchema     // Unset | Canonical | Meta
searchIndexerStateSchema // EpisodeNotFound | … | Unknown
```

Reuse these on both request and response schemas.

## Status codes

OpenAPI `responses` must match what the **worker** returns, not only Azure:

1. Read CF handler (`successStatuses`, `forwardStatuses`, `passthroughOtherStatuses`) or R2/DO logic.
2. Cross-check Azure handler (`ctx.Ok` / `Accepted` / `NotFound` / …).
3. Always document worker auth: **401** / **403** via shared `authResponses` + `errorSchema`.

Common mismatches to avoid:

| Wrong in Swagger | Correct (api-infra) |
|------------------|---------------------|
| Episode update **200** | **202** + `EpisodeUpdateResponse` |
| Podcast/person/subject update **200** | **202** |
| Opaque success | Concrete DTO / empty description for empty body |

## Anti-patterns (cause `additionalProp1/2/3`)

| Avoid | Use instead |
|-------|-------------|
| `.passthrough()` on known DTOs | Strict `z.object({ … })` with only known keys |
| `z.record(z.string(), z.unknown())` / `z.any()` | Named fields from C# |
| `z.string()` for string enums | `z.enum([...])` |
| `serviceUrlsSchema` (`.url()` only) on **PATCH** bodies | Patch URI union allowing `""` |
| Inventing fields not on the DTO | Only `[JsonPropertyName]` members (plus documented worker-only extras if any) |

`z.record` is OK only for true dynamic maps (R2 flairs keyed by Guid, languages code→name).

## Checklist for a new / changed Azure DTO

- [ ] Schema keys match `[JsonPropertyName]`
- [ ] Enums use `z.enum` of member names
- [ ] No `.passthrough()` / opaque record on this DTO
- [ ] Route success + forwarded error codes updated in `openapiRoutes.ts`
- [ ] Vitest accepts a realistic fixture; rejects invalid enum if applicable
- [ ] JSDoc points at the C# type path
- [ ] `npm test` && `npm run lint`

## Example: episode change request

C#: `Cloud/Api/Models/EpisodeChangeRequest.cs` → JSON `unBluesky`, `lang`, `urls` (`ServiceUrls`), `images` (`ServiceImageUrls`).
Episode GET still exposes posted state as `bluesky` on `EpisodeDto` — that is not the change-request field.

Worker: `episodeChangeRequestSchema` in `src/openapiSchemas.ts`, used by update-episode routes in `openapiRoutes.ts`.

## Episode GET by id: every kind (RPP all-kinds lookup)

`GET /episode/:id` (curate) and `GET /public/episode/:id` (signed in) are passthrough proxies to `episode/{id}` and `public/episode/{id}`. Azure first looks up a podcast episode; when none has the id it looks up a news report, TV episode or film (the catalogue migration keeps ids, so Review links and bookmarks keep working). The public GET is 404 when the item or its parent is removed; the curator GET returns removed items, as it does for episodes.

Both bodies keep every existing field and add `contentKind` (`Episode` | `NewsReport` | `TvShowEpisode` | `Film`), `parentId`, `parentName`, `slug` and `path` (`playableKindFields` in `src/openapiSchemas.ts`; C# `Api.Models.PlayableKind`). Null fields are omitted: a film has no `parentId`/`parentName`, and episode bodies from other routes (outgoing lists) carry none of them. For a news report or TV episode `podcastId`/`podcastName` are the organisation or show; for a film they are the film's own id and name. `path` is the site path with the kind's short id (`/podcast/…`, `/news/…`, `/tv/…`, `/film/…`).

## Catalogue curation proxies (curate)

All curator-only (`curate` permission, `curateAuth`), bearer token forwarded to api-infra. PATCH is a command. The news organisation and TV show PATCHes return **202 with an empty body**. The news report, TV episode and film PATCHes return **202 with the episode `EpisodeUpdateResponse`** (`tweetDeleted`, `blueskyPostDeleted`, `searchIndexerState`), the same as `PATCH /episode`.

| Worker route | Azure Function | C# DTO / request | Zod | Forwarded statuses |
|---|---|---|---|---|
| `GET /tvshow/:identifier` | `tvshow/{id or name}` | `TvShowDto` | `tvShowDtoSchema` | 200, 404, 409 |
| `PATCH /tvshow/:id` | `tvshow/{id}` | `TvShowChangeRequest` (publisher fields + imdb/tvdb + service ids) | `tvShowChangeRequestSchema` | 202, 400, 404 |
| `GET /tvshowepisode/:id` | `tvshowepisode/{id}` | `TvShowEpisodeDto` | `tvShowEpisodeDtoSchema` | 200, 404 |
| `PATCH /tvshowepisode/:id` | `tvshowepisode/{id}` | `TvShowEpisodeChangeRequest` (playable fields incl. guests, post status, `services` + imdb/tvdb) | `tvShowEpisodeChangeRequestSchema` | 202 (`episodeUpdateResponseSchema`), 400, 404 |
| `GET /film/:identifier` | `film/{id or name}` | `FilmDto` | `filmDtoSchema` | 200, 404, 409 |
| `PATCH /film/:id` | `film/{id}` | `FilmChangeRequest` (publisher + film playable fields incl. guests, post status, `services` + imdb) | `filmChangeRequestSchema` | 202 (`episodeUpdateResponseSchema`), 400, 404 |
| `GET /newsorganisation/:identifier` | `NewsOrganisationGet`, `newsorganisation/{newsOrganisationIdentifier}` (guid or route-form name) | `NewsOrganisationDto` | `newsOrganisationDtoSchema` | 200, 401, 404, 409 (guid array), 500 |
| `PATCH /newsorganisation/:id` | `NewsOrganisationPatch`, `newsorganisation/{newsOrganisationId:guid}` | `NewsOrganisationChangeRequest` (publisher fields + service ids) | `newsOrganisationChangeRequestSchema` | 202 (empty), 400, 401, 404 (`{id}`), 500 |
| `GET /newsreport/:id` | `NewsReportGet`, `newsreport/{reportId:guid}` | `NewsReportDto` (+ `ServiceLinkDto`) | `newsReportDtoSchema` | 200, 401, 404, 500 |
| `PATCH /newsreport/:id` | `NewsReportPatch`, `newsreport/{reportId:guid}` | `NewsReportChangeRequest` (playable fields incl. `services`) | `newsReportChangeRequestSchema` | 202 (`episodeUpdateResponseSchema`), 400, 401, 404 (`{id}`), 500 |
| `POST /newsorganisation/name/:identifier` (**admin**) | `NewsOrganisationRename`, `newsorganisation/name/{newsOrganisationIdentifier}` | `CatalogueRenameRequest` → `CatalogueRenameResponse` | `catalogueRenameRequestSchema` / `catalogueRenameResponseSchema` | 200, 400, 404, 409 (empty, or guid array) |
| `POST /tvshow/name/:identifier` (**admin**) | `TvShowRename`, `tvshow/name/{tvShowIdentifier}` | the same | the same | 200, 400, 404, 409 |
| `POST /film/name/:identifier` (**admin**) | `FilmRename`, `film/name/{filmIdentifier}` | the same | the same | 200, 400, 404, 409 |

**Service ids (RPP #1053, `ServiceIdsChangeRequest` / `ServiceIdsDto`).** `PATCH /newsorganisation/:id` and `PATCH /tvshow/:id` accept `youTubeChannelId`, `youTubePlaylistId`, `spotifyId` (strings) and `appleId` (integer) / `nullAppleId` (boolean), with the podcast edit API's wire names and rules (`""` clears a string id; `nullAppleId: true` clears `appleId`; a replaced playlist id is kept in history). RPP stores them in the parent's `indexing` block (RPP #1050 `CatalogueIndexingSource`; not auto-indexed). The GETs return them flat, plus `youTubePlaylistIdHistory` (`[{id, replacedAt}]`); all optional for rollout. Films have none. `name` is in neither PATCH: rename is the admin `POST /{kind}/name/:identifier`.

**Editing parity (RPP #1053).** News, TV and film editing share one set of fields. The TV and film proxies pass request and response bodies through verbatim. `PATCH /newsreport` no longer drops its 202 body (`emptyAcknowledgement` removed), so it forwards the outcome like `PATCH /episode`:

| Entity | Zod (GET / PATCH) | Shared shape | Extra fields |
|---|---|---|---|
| News organisation | `newsOrganisationDtoSchema` / `newsOrganisationChangeRequestSchema` | publisher fields (`PublisherFieldsDto` / `PublisherFieldsChangeRequest`): `publisher`, `description`, `removed`, `language`, handles, hashtags, terms, subjects | none; `searchTerms` / `language` / `removed` are copied to reports (`removed` cascades) |
| TV show | `tvShowDtoSchema` / `tvShowChangeRequestSchema` | publisher fields | `imdb`, `tvdb` (+ read-only `imdbId`, `tvdbId`, `tmdbId`); `searchTerms` / `language` / `removed` are copied to episodes (`removed` cascades) |
| News report | `newsReportDtoSchema` / `newsReportChangeRequestSchema` | playable fields (`PlayableFieldsDto` / `PlayableFieldsChangeRequest`) incl. `guests`, post status (`posted`, `tweeted`, `unBluesky`), and `services` (RPP #1130; same link patch as film) | read-only `newsOrganisationId`, `newsOrganisationName` |
| TV episode | `tvShowEpisodeDtoSchema` / `tvShowEpisodeChangeRequestSchema` | playable fields incl. `guests`, post status, and `services` (RPP #1130) | `imdb`, `tvdb` (+ read-only `tvShowId`, `tvShowName`, `imdbId`, `tvdbId`, `tmdbId`) |
| Film | `filmDtoSchema` / `filmChangeRequestSchema` | publisher fields | `imdb` (+ read-only `imdbId`, `tmdbId`), `release` (`yyyy` or `yyyy-MM-dd`), `duration`, `explicit`, `ignored`, `subjects`, `guests`, post status `posted` / `tweeted` / `unBluesky`, and patchable `services` (same link patch as news/TV; existed before RPP #1130); (+ read-only `blueskyPosted`); no title. `publisher`, `description` and `removed` come from the publisher fields |

Rules: omitted or null means unchanged. `""` clears a string and `[]` clears a list. `language` `""` or English becomes null. `guests` follows the episode edit API: it replaces the list, `[]` clears it to null, blank names are dropped and names trimmed. Playable `services` (film (existing) + news/TV (RPP #1130)) is a per-key link patch: blank `url`+`image` removes the key; otherwise the key is resolved from the URL; absolute http(s) only — Azure 400s before applying. Playable `release` is `yyyy-MM-dd` only (films also accept `yyyy`), and `duration` is a non-negative TimeSpan; Azure returns 400 before applying anything. `removed: true` on a news report, TV episode or film also deletes its search document.

`removed` on a news organisation or TV show **cascades**, mirroring a podcast removal:
- every child's `parentRemoved` is set or cleared, and its own `removed` is untouched, so a child removed individually stays removed;
- on removal every child's search document is deleted;
- on un-remove the restored children are saved, and the next indexer run re-adds them.

The cascade only saves children that changed, so a retry is safe.

Post status follows the episode edit API:
- `posted` sets the flag;
- `tweeted` sets the flag, and true → false also deletes the tweet;
- `unBluesky: true` deletes the Bluesky post and clears the Bluesky state only when the post is gone;
- Bluesky posted cannot be set to true.

Name is not editable here. The new TV and film GET DTO fields are optional in Zod, so the older Azure shape still validates during rollout.

**Rename (RPP #1053).** The three rename proxies (`src/renameCatalogue.ts`) copy `POST /podcast/name/:name` (`src/renamePodcast.ts`):
- They need the `admin` permission (`adminAuth`).
- They POST the body to Azure, pass the 200 `{"indexState"}` through, forward 400/404/409, and turn any other status into a Worker 500.
- The body is `{"newName"}` rather than the podcast's `{"newPodcastName"}`. `identifier` is a guid or a route-form name.

What RPP does on a rename:
- It writes the redirect to the website's `redirects` KV namespace (the same one the podcast rename uses), under the key `news/{old}`, `tv/{old}` or `film/{old}`.
- It copies the name onto the children (`newsOrganisationName` / `tvShowName`) and patches the search `seriesName` / `title`.
- It keeps the stored fileKey.

The Worker does not read the redirects KV; the website's Pages worker (`server.ts`) serves the podcast redirects.

TV and film rewrite any other status to a Worker 500. The news routes also forward Azure's own 401 (`{"Message":"Unauthorised"}`) and 500 bodies (RPP #1053). An unexpected 409 on `GET /newsreport` is still a Worker 500. The Worker's own 401 (no token) and 403 (no `curate`) are returned before Azure is called.

## Related files

| File | Role |
|------|------|
| `src/openapiSchemas.ts` | Zod schemas |
| `src/openapiRoutes.ts` | Chanfana route OpenAPI (status + schema) |
| `tests/openapi-schemas.spec.ts` | Schema parse contracts |
| `src/proxyToAzure.ts` | Runtime status forwarding for Azure proxies |

When Azure DTO shapes change in RedditPodcastPoster, update the Zod schema in the same PR wave as the Functions deploy (or immediately after) so Swagger on `api.cultpodcasts.com` stays honest.
