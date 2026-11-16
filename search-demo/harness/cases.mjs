/**
 * Query corpus for the Azure-vs-D1 parity harness.
 *
 * odataUseCases: every /search POST shape the Angular app constructs, captured
 * from the website source (search-api, subject-api, podcast-api, series-hub,
 * redirect-moved-kind.guard, episode.service, playable-detail-shell). Values
 * are real catalogue values so both engines return non-trivial results.
 *
 * freeTextQueries: what most users actually type — no syntax. Chosen to probe
 * tokenizer behaviour too: apostrophes, hyphens, initials with periods,
 * possessives, multi-word OR semantics.
 *
 * syntaxQueries: the minority power-user syntax (phrases, +, -, *).
 */

export const odataUseCases = [
  {
    name: "search page: free text, rank order, facets",
    body: {
      search: "scientology",
      filter: "",
      searchMode: "any",
      queryType: "simple",
      count: true,
      skip: 0,
      top: 20,
      facets: ["seriesName,count:1000,sort:count", "subjects,count:10,sort:count"], // pragma: allowlist secret
      orderby: "",
    },
  },
  {
    name: "search page: show + kind narrowed",
    body: {
      search: "scientology",
      filter: "search.in(seriesName, 'Surviving Scientology', '£') and search.in(contentKind, 'Episode', '£')",
      searchMode: "any",
      queryType: "simple",
      count: true,
      skip: 0,
      top: 20,
      facets: [],
      orderby: "",
    },
  },
  {
    name: "search page: date-desc sort",
    body: {
      search: "nxivm",
      filter: "",
      searchMode: "any",
      queryType: "simple",
      count: true,
      skip: 0,
      top: 20,
      facets: [],
      orderby: "release desc",
    },
  },
  {
    name: "subject page: facet probe (top 0)",
    body: {
      search: "",
      filter: "subjects/any(s: s eq 'Scientology')", // pragma: allowlist secret
      searchMode: "any",
      queryType: "simple",
      count: true,
      skip: 0,
      top: 0,
      facets: ["seriesName,count:1000,sort:count", "contentKind", "lang"],
      orderby: "release desc",
    },
  },
  {
    name: "subject page: results, kind + show + lang narrowed",
    body: {
      search: "",
      filter:
        "subjects/any(s: s eq 'Scientology') and search.in(seriesName, 'Surviving Scientology', '£') and search.in(contentKind, 'Episode', '£') and ((lang eq null or lang eq 'en') or search.in(lang, 'en', ','))", // pragma: allowlist secret
      searchMode: "any",
      queryType: "simple",
      count: true,
      skip: 0,
      top: 20,
      facets: [],
      orderby: "release desc",
    },
  },
  {
    name: "subject page: search within subject",
    body: {
      search: "miscavige",
      filter: "subjects/any(s: s eq 'Scientology')", // pragma: allowlist secret
      searchMode: "any",
      queryType: "simple",
      count: true,
      skip: 0,
      top: 20,
      facets: [],
      orderby: "",
    },
  },
  {
    name: "podcast page: all episodes, subject facet",
    body: {
      search: "",
      filter: "(seriesName eq 'Surviving Scientology')",
      searchMode: "any",
      queryType: "simple",
      count: true,
      skip: 0,
      top: 20,
      facets: ["subjects,count:1000,sort:count"], // pragma: allowlist secret
      orderby: "release desc",
    },
  },
  {
    name: "podcast page: search within podcast",
    body: {
      search: "clearwater",
      filter: "(seriesName eq 'Surviving Scientology')",
      searchMode: "any",
      queryType: "simple",
      count: true,
      skip: 0,
      top: 20,
      facets: ["subjects,count:1000,sort:count"], // pragma: allowlist secret
      orderby: "",
    },
  },
  {
    name: "moved-kind probe: series + kind or-group",
    body: {
      search: "",
      filter: "(seriesName eq 'Panorama') and (contentKind eq 'NewsReport' or contentKind eq 'TvShowEpisode')",
      searchMode: "any",
      queryType: "simple",
      count: true,
      skip: 0,
      top: 5,
      facets: [],
      orderby: "release desc",
    },
  },
  {
    name: "episode lookup by id",
    bodyFromSample: (sampleId) => ({
      search: "",
      filter: `(id eq '${sampleId}')`,
      searchMode: "any",
      queryType: "simple",
      count: false,
      skip: 0,
      top: 20,
      facets: [],
      orderby: "release desc",
    }),
  },
  {
    name: "related rail: same show, exclude self (id ne)",
    bodyFromSample: (sampleId) => ({
      search: "",
      filter: `contentKind eq 'Episode' and (seriesName eq 'Surviving Scientology') and id ne '${sampleId}'`,
      searchMode: "any",
      queryType: "simple",
      count: false,
      skip: 0,
      top: 10,
      facets: [],
      orderby: "release desc",
    }),
  },
  {
    name: "related rail: same subject, exclude self",
    bodyFromSample: (sampleId) => ({
      search: "",
      filter: `subjects/any(s: s eq 'NXIVM') and id ne '${sampleId}'`, // pragma: allowlist secret
      searchMode: "any",
      queryType: "simple",
      count: false,
      skip: 0,
      top: 10,
      facets: [],
      orderby: "release desc",
    }),
  },
];

export const freeTextQueries = [
  "scientology",
  "nxivm keith raniere",
  "jonestown",
  "jim jones",
  "branch davidians waco",
  "heaven's gate",
  "jehovah's witnesses",
  "latter-day saints",
  "ex-mormon",
  "mormon stories",
  "warren jeffs flds",
  "twin flames universe",
  "teal swan",
  "love has won mother god",
  "amy carlson",
  "children of god",
  "the family international",
  "unification church moonies",
  "sun myung moon",
  "hare krishna iskcon",
  "bhagwan shree rajneesh",
  "ma anand sheela",
  "osho",
  "synanon",
  "landmark forum",
  "est werner erhard",
  "qanon",
  "multi-level marketing",
  "lularoe",
  "opus dei",
  "plymouth brethren",
  "gloriavale",
  "kundalini yoga",
  "l. ron hubbard",
  "david miscavige",
  "sea org",
  "clearwater florida",
  "paulette cooper",
  "tony quinn educo",
  "scientology's secrets",
  "falun gong",
  "aum shinrikyo",
  "order of the solar temple",
];

export const syntaxQueries = [
  '"paulette cooper"',
  'scientology+"paulette cooper"',
  '"Hannah W."',
  '"sea org" miscavige',
  "cult* recovery",
  "mormon+missionary",
  '"twin flames"',
  "scientolog*",
];
