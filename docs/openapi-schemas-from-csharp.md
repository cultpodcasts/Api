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
2. **Read `[JsonPropertyName("…")]`** — Zod keys must match JSON names, not C# property names (`BlueskyPosted` → `bluesky`, `Language` → `lang`, `Length` → `duration`).
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

C#: `Cloud/Api/Models/EpisodeChangeRequest.cs` → JSON `bluesky`, `lang`, `urls` (`ServiceUrls`), `images` (`ServiceImageUrls`).

Worker: `episodeChangeRequestSchema` in `src/openapiSchemas.ts`, used by update-episode routes in `openapiRoutes.ts`.

## Related files

| File | Role |
|------|------|
| `src/openapiSchemas.ts` | Zod schemas |
| `src/openapiRoutes.ts` | Chanfana route OpenAPI (status + schema) |
| `tests/openapi-schemas.spec.ts` | Schema parse contracts |
| `src/proxyToAzure.ts` | Runtime status forwarding for Azure proxies |

When Azure DTO shapes change in RedditPodcastPoster, update the Zod schema in the same PR wave as the Functions deploy (or immediately after) so Swagger on `api.cultpodcasts.com` stays honest.
