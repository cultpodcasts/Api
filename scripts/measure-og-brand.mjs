import { createRequire } from "node:module";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const { data, info } = await sharp(".tmp/og-preview/og-card-wide.png")
	.ensureAlpha()
	.raw()
	.toBuffer({ resolveWithObject: true });
const w = info.width;
const h = info.height;

function scan(x0, x1, y0, y1, pred) {
	let minY = h;
	let maxY = 0;
	let minX = w;
	let maxX = 0;
	let n = 0;
	for (let y = y0; y <= y1; y++) {
		for (let x = x0; x <= x1; x++) {
			const i = (y * w + x) * 4;
			if (pred(data[i], data[i + 1], data[i + 2])) {
				n++;
				minY = Math.min(minY, y);
				maxY = Math.max(maxY, y);
				minX = Math.min(minX, x);
				maxX = Math.max(maxX, x);
			}
		}
	}
	return { n, x: [minX, maxX], y: [minY, maxY], h: n ? maxY - minY + 1 : 0, w: n ? maxX - minX + 1 : 0 };
}

const bandY0 = 110;
const bandY1 = 185;
const logo = scan(720, 800, bandY0, bandY1, (r, g, b) => r > 230 && g > 230 && b > 230);
const amber = scan(800, 1200, bandY0, bandY1, (r, g, b) => r > 200 && g > 140 && g < 220 && b < 130);
const ts = fs.readFileSync("src/ogBrandLogo.ts", "utf8");
console.log(
	JSON.stringify(
		{
			logo,
			amber,
			diff: logo.h - amber.h,
			svgHasWidth: /width=/.test(ts),
			svgHasHeight: /height=/.test(ts)
		},
		null,
		2
	)
);
