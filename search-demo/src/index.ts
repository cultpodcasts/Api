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

interface Env {
  SEARCH_DB: D1Database;
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

/** User text -> safe FTS5 MATCH expression: tokens are double-quoted (implicit AND); a trailing * keeps prefix search. */
function toMatchExpression(q: string): string | null {
  const tokens = q
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => {
      const prefix = t.endsWith("*");
      const bare = (prefix ? t.slice(0, -1) : t).replaceAll('"', '""');
      if (!bare) return null;
      return `"${bare}"${prefix ? "*" : ""}`;
    })
    .filter((t): t is string => t !== null);
  return tokens.length ? tokens.join(" ") : null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/search") {
      return new Response("search-demo: GET /search?q=…", { status: 404 });
    }

    const q = url.searchParams.get("q") ?? "";
    const match = toMatchExpression(q);
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
      "d.rowid, d.id, d.kind, d.title, d.series_name, d.release, d.duration, d.lang, d.spotify_id, d.youtube_id, d.apple_id, d.podcast_apple_id, d.image, d.svc, d.bbc";

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
        description: d.snip,
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
