import fs from "node:fs";

const svg = fs.readFileSync("src/assets/cultpodcasts.svg", "utf8");
const out = [
	"/** Site mark from website cultpodcasts/src/assets/cultpodcasts.svg */",
	`const CULT_PODCASTS_LOGO_SVG = ${JSON.stringify(svg)};`,
	"",
	"export function brandLogoDataUrl(): string {",
	'\treturn "data:image/svg+xml;base64," + btoa(CULT_PODCASTS_LOGO_SVG);',
	"}",
	""
].join("\n");

fs.writeFileSync("src/ogBrandLogo.ts", out);
console.log("wrote src/ogBrandLogo.ts", out.length);
