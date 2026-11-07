/**
 * Search-platform epic prototype: Azure-AI-Search-shaped responses from D1 FTS5.
 *
 * GET /search
 *   q        full-text query (optional — omitted means browse/filter only)
 *   kind     filter: Episode | TvShowEpisode | Film | NewsReport
 *   subject  filter: exact subject name
 *   series   filter: exact seriesName
 *   lang     filter: BCP-47 tag ("en" matches stored NULL = English)
 *   orderby  rank (default when q present) | release (default otherwise)
 *   skip/top paging (top <= 50)
 *   facets   "true" to include subject/kind/lang facet counts
 *
 * Response mirrors the Azure Search shape the website binds today:
 *   { "@odata.count", value: [...], "@search.facets"?: {...} }
 */

import { authorize, type AuthEnv } from "./auth";
import { renderPage } from "./page";
import { toMatchExpression, type SearchMode } from "./query";
import { parseODataFilter, parseFacet } from "./odata";

interface Env extends AuthEnv {
  SEARCH_DB: D1Database;
  AUTH0_CLIENT_ID: string;
  /** Shared key for the Azure-shaped POST endpoint (mirrors Azure's api-key). */
  SEARCH_API_KEY: string;
}

/** Request body shape the api Worker forwards today (oDataSearchModel + extras the website sends). */
interface ODataSearchRequest {
  search?: string;
  filter?: string;
  skip?: number | string;
  top?: number | string;
  count?: boolean;
  orderby?: string;
  facets?: string[];
  searchMode?: string;
  queryType?: string;
}

interface DocRow {
  rowid: number;
  id: string;
  kind: string;
  title: string;
  series_name: string | null;
  snip: string | null;
  description: string | null;
  release: number;
  duration: string;
  lang: string | null;
  spotify_id: string | null;
  youtube_id: string | null;
  apple_id: string | null;
  podcast_apple_id: string | null;
  image: string;
  svc: string;
  bbc: string;
}


export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/") {
      return new Response(
        renderPage({
          domain: env.AUTH0_DOMAIN,
          clientId: env.AUTH0_CLIENT_ID,
          audience: env.AUTH0_AUDIENCE,
        }),
        { headers: { "content-type": "text/html;charset=utf-8", "cache-control": "no-store" } } // pragma: allowlist secret
      );
    }
    // Azure-shaped drop-in: POST …/docs/search with the same body + api-key
    // header the api Worker sends to Azure AI Search today (swap env.apihost).
    if (request.method === "POST" && url.pathname.endsWith("/docs/search")) {
      if (request.headers.get("api-key") !== env.SEARCH_API_KEY) {
        return Response.json({ error: { code: "", message: "invalid api-key" } }, { status: 403 });
      }
      try {
        return await odataSearch(await request.json<ODataSearchRequest>(), env);
      } catch (e) {
        // Azure returns 400 with an error envelope for bad filter/body syntax.
        return Response.json(
          { error: { code: "", message: e instanceof Error ? e.message : "bad request" } },
          { status: 400 }
        );
      }
    }
    if (url.pathname !== "/search") {
      return new Response("search-demo: GET / (UI), GET /search?q=…, or POST …/docs/search", { status: 404 });
    }

    const auth = await authorize(request, env);
    if (!auth.ok) {
      return Response.json({ error: auth.reason }, { status: auth.status });
    }

    const q = url.searchParams.get("q") ?? "";
    const mode: SearchMode = url.searchParams.get("mode") === "all" ? "all" : "any";
    const match = toMatchExpression(q, mode);
    const kind = url.searchParams.get("kind");
    const subject = url.searchParams.get("subject");
    const series = url.searchParams.get("series");
    const lang = url.searchParams.get("lang");
    const top = Math.min(Number(url.searchParams.get("top") ?? 20) || 20, 50);
    const skip = Math.max(Number(url.searchParams.get("skip") ?? 0) || 0, 0);
    const orderby = url.searchParams.get("orderby") ?? (match ? "rank" : "release");
    const wantFacets = url.searchParams.get("facets") === "true";

    const where: string[] = [];
    const binds: unknown[] = [];
    let from: string;
    let select =
      "d.rowid, d.id, d.kind, d.title, d.series_name, d.description, d.release, d.duration, d.lang, d.spotify_id, d.youtube_id, d.apple_id, d.podcast_apple_id, d.image, d.svc, d.bbc";

    if (match) {
      from = "search_fts JOIN search_docs d ON d.rowid = search_fts.rowid";
      select += ", snippet(search_fts, 2, '<b>', '</b>', '…', 24) AS snip";
      where.push("search_fts MATCH ?");
      binds.push(match);
    } else {
      from = "search_docs d";
      select += ", substr(d.description, 1, 200) AS snip";
    }
    if (kind) {
      where.push("d.kind = ?");
      binds.push(kind);
    }
    if (series) {
      where.push("d.series_name = ?");
      binds.push(series);
    }
    if (lang) {
      // Stored NULL means English (episode-language contract).
      if (lang === "en") where.push("d.lang IS NULL");
      else {
        where.push("d.lang = ?");
        binds.push(lang);
      }
    }
    if (subject) {
      where.push("EXISTS (SELECT 1 FROM doc_subjects s WHERE s.rowid_ref = d.rowid AND s.subject = ?)"); // pragma: allowlist secret
      binds.push(subject);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const orderSql =
      orderby === "rank" && match ? "ORDER BY rank" : "ORDER BY d.release DESC";

    const started = performance.now();
    const page = env.SEARCH_DB
      .prepare(`SELECT ${select} FROM ${from} ${whereSql} ${orderSql} LIMIT ? OFFSET ?`)
      .bind(...binds, top, skip);
    const count = env.SEARCH_DB
      .prepare(`SELECT COUNT(*) AS n FROM ${from} ${whereSql}`)
      .bind(...binds);

    const statements = [page, count];
    if (wantFacets) {
      statements.push(
        env.SEARCH_DB
          .prepare(
            `SELECT s.subject AS value, COUNT(*) AS count FROM ${from} JOIN doc_subjects s ON s.rowid_ref = d.rowid ${whereSql} GROUP BY s.subject ORDER BY count DESC LIMIT 20` // pragma: allowlist secret
          )
          .bind(...binds),
        env.SEARCH_DB
          .prepare(
            `SELECT d.kind AS value, COUNT(*) AS count FROM ${from} ${whereSql} GROUP BY d.kind ORDER BY count DESC`
          )
          .bind(...binds),
        env.SEARCH_DB
          .prepare(
            `SELECT COALESCE(d.lang, 'en') AS value, COUNT(*) AS count FROM ${from} ${whereSql} GROUP BY COALESCE(d.lang, 'en') ORDER BY count DESC LIMIT 10`
          )
          .bind(...binds)
      );
    }

    const results = await env.SEARCH_DB.batch(statements);
    const elapsedMs = Math.round((performance.now() - started) * 10) / 10;

    const docs = results[0].results as unknown as DocRow[];
    const total = (results[1].results[0] as { n: number }).n;

    // Subject chips for the returned page.
    const subjectsByDoc = new Map<number, string[]>(); // pragma: allowlist secret
    if (docs.length) {
      const placeholders = docs.map(() => "?").join(",");
      const subjectRows = await env.SEARCH_DB
        .prepare(
          `SELECT rowid_ref, subject FROM doc_subjects WHERE rowid_ref IN (${placeholders})` // pragma: allowlist secret
        )
        .bind(...docs.map((d) => d.rowid))
        .all<{ rowid_ref: number; subject: string }>();
      for (const row of subjectRows.results) {
        const list = subjectsByDoc.get(row.rowid_ref) ?? []; // pragma: allowlist secret
        list.push(row.subject);
        subjectsByDoc.set(row.rowid_ref, list); // pragma: allowlist secret
      }
    }

    const body: Record<string, unknown> = {
      "@odata.count": total,
      value: docs.map((d) => ({
        id: d.id,
        contentKind: d.kind, // pragma: allowlist secret
        title: d.title,
        seriesName: d.series_name,
        snippet: d.snip,
        description: d.description,
        release: new Date(d.release * 1000).toISOString(),
        duration: d.duration,
        lang: d.lang,
        spotifyId: d.spotify_id,
        youtubeId: d.youtube_id,
        appleId: d.apple_id,
        podcastAppleId: d.podcast_apple_id,
        image: d.image,
        svc: d.svc,
        bbc: d.bbc,
        subjects: subjectsByDoc.get(d.rowid) ?? [], // pragma: allowlist secret
      })),
      elapsedMs,
    };
    if (wantFacets) {
      body["@search.facets"] = {
        subjects: results[2].results, // pragma: allowlist secret
        contentKind: results[3].results, // pragma: allowlist secret
        lang: results[4].results,
      };
    }

    return Response.json(body, {
      headers: { "cache-control": "no-store" },
    });
  },
} satisfies ExportedHandler<Env>;

/** Azure AI Search docs/search lookalike over D1. Field names mirror the production index. */
async function odataSearch(req: ODataSearchRequest, env: Env): Promise<Response> {
  const mode: SearchMode = req.searchMode === "all" ? "all" : "any";
  const match = toMatchExpression(req.search ?? "", mode);
  const top = Math.min(Math.max(Number(req.top ?? 50) || 0, 0), 100);
  const skip = Math.max(Number(req.skip ?? 0) || 0, 0);

  const where: string[] = [];
  const binds: unknown[] = [];
  let from: string;
  let scoreSql = "1.0";
  if (match) {
    from = "search_fts JOIN search_docs d ON d.rowid = search_fts.rowid";
    scoreSql = "-rank"; // FTS5 rank: smaller is better; negate so higher = better like @search.score
    where.push("search_fts MATCH ?");
    binds.push(match);
  } else {
    from = "search_docs d";
  }
  if (req.filter?.trim()) {
    const parsed = parseODataFilter(req.filter);
    where.push(parsed.sql);
    binds.push(...parsed.binds);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const ob = (req.orderby ?? "").trim().toLowerCase();
  const orderSql =
    ob === "release asc" ? "ORDER BY d.release ASC"
    : ob === "release desc" || (!match && !ob) ? "ORDER BY d.release DESC"
    : match ? "ORDER BY rank"
    : "ORDER BY d.release DESC";

  const select = `${scoreSql} AS score, d.rowid, d.id, d.kind, d.title, d.series_name, d.description, d.release, d.duration, d.lang, d.spotify_id, d.youtube_id, d.apple_id, d.podcast_apple_id, d.image, d.svc, d.bbc`;
  const statements = [
    env.SEARCH_DB.prepare(`SELECT ${select} FROM ${from} ${whereSql} ${orderSql} LIMIT ? OFFSET ?`).bind(...binds, top, skip),
    env.SEARCH_DB.prepare(`SELECT COUNT(*) AS n FROM ${from} ${whereSql}`).bind(...binds),
  ];

  const facetSpecs = (req.facets ?? []).map(parseFacet);
  for (const f of facetSpecs) {
    const facetSql =
      f.field === "subjects" // pragma: allowlist secret
        ? `SELECT s.subject AS value, COUNT(*) AS count FROM ${from} JOIN doc_subjects s ON s.rowid_ref = d.rowid ${whereSql} GROUP BY s.subject ORDER BY count DESC LIMIT ${f.count}` // pragma: allowlist secret
        : f.field === "lang"
          ? `SELECT COALESCE(d.lang, 'en') AS value, COUNT(*) AS count FROM ${from} ${whereSql} GROUP BY COALESCE(d.lang, 'en') ORDER BY count DESC LIMIT ${f.count}`
          : `SELECT ${f.field === "contentKind" ? "d.kind" : "d.series_name"} AS value, COUNT(*) AS count FROM ${from} ${whereSql} GROUP BY 1 ORDER BY count DESC LIMIT ${f.count}`;
    statements.push(env.SEARCH_DB.prepare(facetSql).bind(...binds));
  }

  const results = await env.SEARCH_DB.batch(statements);
  const docs = results[0].results as unknown as (DocRow & { score: number })[];
  const total = (results[1].results[0] as { n: number }).n;

  const subjectsByDoc = new Map<number, string[]>(); // pragma: allowlist secret
  if (docs.length) {
    const subjectRows = await env.SEARCH_DB
      .prepare(`SELECT rowid_ref, subject FROM doc_subjects WHERE rowid_ref IN (${docs.map(() => "?").join(",")})`) // pragma: allowlist secret
      .bind(...docs.map((d) => d.rowid))
      .all<{ rowid_ref: number; subject: string }>();
    for (const row of subjectRows.results) {
      const list = subjectsByDoc.get(row.rowid_ref) ?? []; // pragma: allowlist secret
      list.push(row.subject);
      subjectsByDoc.set(row.rowid_ref, list); // pragma: allowlist secret
    }
  }

  const body: Record<string, unknown> = {
    "@odata.context": null,
    value: docs.map((d) => ({
      "@search.score": d.score,
      id: d.id,
      contentKind: d.kind, // pragma: allowlist secret
      title: d.title,
      seriesName: d.series_name,
      podcastName: d.series_name,
      description: d.description,
      release: new Date(d.release * 1000).toISOString(),
      duration: d.duration,
      lang: d.lang,
      spotifyId: d.spotify_id,
      appleId: d.apple_id,
      podcastAppleId: d.podcast_apple_id,
      youtubeId: d.youtube_id,
      image: d.image,
      svc: d.svc,
      bbc: d.bbc,
      // Not carried in the demo corpus; present for shape parity with the Azure index.
      internetArchive: null,
      trailers: null,
      subjects: subjectsByDoc.get(d.rowid) ?? [], // pragma: allowlist secret
    })),
  };
  if (req.count) body["@odata.count"] = total;
  if (facetSpecs.length) {
    const facets: Record<string, unknown> = {};
    facetSpecs.forEach((f, idx) => {
      facets[f.field] = results[2 + idx].results;
    });
    body["@search.facets"] = facets;
  }
  return Response.json(body, { headers: { "cache-control": "no-store" } });
}
