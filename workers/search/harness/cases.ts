/**
 * Ranking harness query set (SP-1.8, cultpodcasts/Api#225).
 *
 * - `freeText`: what users type, from the SP-1.9 parity harness (`search-demo/harness/cases.mjs`
 *   on cultpodcasts/Api#214): tokenizer edges (apostrophes, hyphens, initials) and multi-word ORs.
 * - `exactTitle` / `exactAka`: the cutover gate (Jon, 16 Nov 2026). An unquoted query that is a
 *   film's title, or one of its `alternativeTitles`, must rank that film first. Real catalogue
 *   films (production, 17 Nov 2026).
 * - `quoted`: phrases keep phrase semantics.
 */

export const freeText = [
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
	"order of the solar temple"
];

/** Unquoted query → the film title it must rank first. */
export const exactTitle: { query: string; title: string }[] = [
	{ query: "Faderhuset", title: "Faderhuset" },
	{ query: "Going Clear", title: "Going Clear" },
	{ query: "Jesus Camp", title: "Jesus Camp" },
	{ query: "Mea Maxima Culpa", title: "Mea Maxima Culpa" },
	{ query: "My Scientology Movie", title: "My Scientology Movie" },
	{ query: "Witness to Waco", title: "Witness to Waco" },
	{ query: "Death of the Solar Temple", title: "Death of the Solar Temple" },
	{ query: "jonestown terror in the jungle", title: "Jonestown: Terror in the Jungle" },
	// Hard: many episodes and news reports share these words.
	{ query: "Children of God", title: "Children of God" },
	{ query: "Manic", title: "Manic" }
];

/** Unquoted query that is an AKA → the film (by title) it must rank first. */
export const exactAka: { query: string; title: string }[] = [
	{ query: "Father's House", title: "Faderhuset" },
	{ query: "fathers house", title: "Faderhuset" },
	{ query: "The Second Interrogation", title: "Albert Speer: The Unseen Interrogation" },
	{ query: "The Order of the Solar Temple", title: "Death of the Solar Temple" },
	{ query: "Die Welle", title: "The Wave (1981)" },
	{ query: "Escape From Jonestown", title: "Escape from Jonestown (2008)" },
	{ query: "The Jonestown Haunting", title: "Jonestown: Terror in the Jungle" },
	{ query: "Together Girls", title: "The Manson Massacre" },
	{ query: "Going Clear: Scientology and the Prison of Belief", title: "Going Clear" },
	// Hard: hundreds of documents about Peoples Temple, Helter Skelter and "the wave".
	{ query: "People's Temple", title: "Peoples Temple (1973)" },
	{ query: "Helter Skelter", title: "Helter Skelter (2004)" },
	{ query: "The Wave", title: "The Wave (1981)" }
];

export const quoted = ['"paulette cooper"', '"Hannah W."', '"twin flames"', '"sea org" miscavige', 'scientology+"paulette cooper"'];
