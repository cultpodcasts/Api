import fs from "fs";

const j = JSON.parse(fs.readFileSync("out/br-episode.json", "utf8"));
const { screenshotPngBase64, html, ...meta } = j;
fs.writeFileSync("out/br-episode-meta.json", JSON.stringify(meta, null, 2));
if (html) fs.writeFileSync("out/br-episode.html", html);
if (screenshotPngBase64) {
	fs.writeFileSync(
		"out/br-episode.png",
		Buffer.from(screenshotPngBase64, "base64")
	);
	console.log("png bytes", Buffer.from(screenshotPngBase64, "base64").length);
}
console.log(JSON.stringify(meta, null, 2));

function signals(html, label) {
	if (!html) {
		console.log(label, { empty: true });
		return;
	}
	const og =
		(html.match(
			/property=["']og:title["'][^>]*content=["']([^"']+)/i
		) ||
			html.match(
				/content=["']([^"']+)["'][^>]*property=["']og:title["']/i
			) ||
			[])[1];
	const title = (html.match(/<title[^>]*>([^<]+)/i) || [])[1];
	const desc =
		(html.match(
			/property=["']og:description["'][^>]*content=["']([^"']+)/i
		) ||
			html.match(/name=["']description["'][^>]*content=["']([^"']+)/i) ||
			[])[1];
	console.log(label, {
		len: html.length,
		title,
		ogTitle: og,
		desc: desc && desc.slice(0, 140),
		hasJsonLd: /ld\+json/i.test(html),
		starts: html.slice(0, 160).replace(/\s+/g, " ")
	});
}

const d = fs.readFileSync("out/direct.html", "utf8");
const b = fs.existsSync("out/br-episode.html")
	? fs.readFileSync("out/br-episode.html", "utf8")
	: "";
signals(d, "DIRECT");
signals(b, "CF_BR");
