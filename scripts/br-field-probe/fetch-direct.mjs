import fs from "fs";

const url =
	process.argv[2] ??
	"https://www.itv.com/watch/children-of-the-cult/10a5261a0001B/10a5261a0001";

const started = Date.now();
const resp = await fetch(url, {
	headers: {
		"User-Agent":
			"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
		Accept: "text/html,application/xhtml+xml",
		"Accept-Language": "en-GB,en;q=0.9"
	},
	redirect: "follow",
	signal: AbortSignal.timeout(30_000)
});
const html = await resp.text();
const meta = {
	source: "direct-fetch",
	status: resp.status,
	finalUrl: resp.url,
	elapsedMs: Date.now() - started,
	htmlLength: html.length,
	title: (html.match(/<title[^>]*>([^<]*)/i) || [])[1] || "",
	htmlHasOgTitle: /property=["']og:title["']/i.test(html),
	htmlHasJsonLd: /application\/ld\+json/i.test(html),
	htmlHasItv: /itv/i.test(html),
	htmlSnippet: html.slice(0, 2500)
};
fs.mkdirSync("out", { recursive: true });
fs.writeFileSync("out/direct-meta.json", JSON.stringify(meta, null, 2));
fs.writeFileSync("out/direct.html", html);
console.log(JSON.stringify(meta, null, 2));
