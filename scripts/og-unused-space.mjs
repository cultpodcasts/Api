import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const INK = [0x0b, 0x0d, 0x12];

function fitArtWithin(srcW, srcH, maxW, maxH) {
	const scale = Math.min(maxW / srcW, maxH / srcH);
	return {
		width: Math.max(1, Math.round(srcW * scale)),
		height: Math.max(1, Math.round(srcH * scale))
	};
}

function nearInk(r, g, b, tol = 18) {
	return Math.abs(r - INK[0]) <= tol && Math.abs(g - INK[1]) <= tol && Math.abs(b - INK[2]) <= tol;
}

async function analyzePng(file) {
	const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
	const total = info.width * info.height;
	let bg = 0;
	for (let i = 0; i < data.length; i += 4) {
		if (nearInk(data[i], data[i + 1], data[i + 2])) bg++;
	}
	return {
		file,
		bgPct: +(100 * bg / total).toFixed(1),
		nonBgPct: +(100 * (total - bg) / total).toFixed(1)
	};
}

function layoutFill(name, canvasW, canvasH, pad, gap, art, textH) {
	const total = canvasW * canvasH;
	const artPx = art.width * art.height;
	const textColW = canvasW - pad * 2 - gap - art.width;
	const textBoxPx = Math.max(0, textColW) * textH;
	const used = artPx + textBoxPx;
	return {
		name,
		art: `${art.width}x${art.height}`,
		artPct: +(100 * artPx / total).toFixed(1),
		textBoxPct: +(100 * textBoxPx / total).toFixed(1),
		artPlusTextBoxPct: +(100 * used / total).toFixed(1),
		unusedVsArtTextBoxPct: +(100 * (total - used) / total).toFixed(1)
	};
}

const wideArt = fitArtWithin(480, 360, 740, 574);
const squareArt = fitArtWithin(640, 640, 360, 378);
const wideTextH = 24 + 14 + Math.ceil(50 * 1.14 * 3) + 12 + 24 + 8 + 20 + 28 + 44;
const squareTextH = 18 + 10 + Math.ceil(34 * 1.14 * 2) + 8 + 20 + 6 + 16 + 20 + 36;

const pixelInk = [
	await analyzePng(".tmp/og-preview/og-card-wide.png"),
	await analyzePng(".tmp/og-preview/og-card-square.png")
];
const layoutRegions = [
	layoutFill("wide", 1200, 630, 28, 28, wideArt, wideTextH),
	layoutFill("square", 800, 418, 20, 24, squareArt, squareTextH)
];

console.log(JSON.stringify({ pixelInk, layoutRegions, wideArt, squareArt, wideTextH, squareTextH }, null, 2));
