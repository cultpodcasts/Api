/**
 * Tiny server-side inline-SVG charts for the soak page (cultpodcasts/Api#304). No dependency, no
 * client script: each chart is a self-contained `<svg>` with a `<title>` for screen readers.
 */

export type ChartSeries = {
	name: string;
	color: string;
	values: (number | null)[];
	/** `bar` series share each x slot side by side; `line` series are drawn over them. */
	kind?: "line" | "bar";
	dashed?: boolean;
};

export type ChartThreshold = { value: number; label: string; color?: string };

export type ChartOptions = {
	title: string;
	labels: string[];
	series: ChartSeries[];
	thresholds?: ChartThreshold[];
	/** Format a y value for the axis and tooltips. */
	format?: (value: number) => string;
	/** Fixed y range; otherwise 0 … max(values, thresholds) with headroom. */
	yMin?: number;
	yMax?: number;
	width?: number;
	height?: number;
};

const PAD = { top: 28, right: 12, bottom: 34, left: 56 };

function esc(value: string): string {
	return value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

const round = (n: number) => Math.round(n * 10) / 10;

/** Render one chart. Null values leave a gap (line) or no bar. */
export function renderChart(opts: ChartOptions): string {
	const width = opts.width ?? 560;
	const height = opts.height ?? 220;
	const format = opts.format ?? ((v: number) => String(Math.round(v)));
	const plotW = width - PAD.left - PAD.right;
	const plotH = height - PAD.top - PAD.bottom;
	const all = opts.series.flatMap((s) => s.values).filter((v): v is number => v !== null && Number.isFinite(v));
	const marks = (opts.thresholds ?? []).map((t) => t.value);
	const yMin = opts.yMin ?? 0;
	let yMax = opts.yMax ?? Math.max(...all, ...marks, 0) * 1.1;
	if (!(yMax > yMin)) yMax = yMin + 1;
	const n = Math.max(opts.labels.length, 1);
	const slot = plotW / n;
	const x = (i: number) => PAD.left + slot * (i + 0.5);
	const y = (v: number) => PAD.top + plotH - ((Math.min(Math.max(v, yMin), yMax) - yMin) / (yMax - yMin)) * plotH;

	const parts: string[] = [];
	parts.push(`<rect x="${PAD.left}" y="${PAD.top}" width="${plotW}" height="${plotH}" fill="#fff" stroke="#e5e7eb"/>`);
	for (let k = 0; k <= 4; k++) {
		const v = yMin + ((yMax - yMin) * k) / 4;
		const yy = round(y(v));
		parts.push(`<line x1="${PAD.left}" x2="${PAD.left + plotW}" y1="${yy}" y2="${yy}" stroke="#f3f4f6"/>`);
		parts.push(`<text x="${PAD.left - 6}" y="${yy + 4}" text-anchor="end" font-size="10" fill="#6b7280">${esc(format(v))}</text>`);
	}
	const every = Math.ceil(n / 12);
	opts.labels.forEach((label, i) => {
		if (i % every !== 0 && i !== n - 1) return;
		parts.push(`<text x="${round(x(i))}" y="${height - PAD.bottom + 14}" text-anchor="middle" font-size="10" fill="#6b7280">${esc(label)}</text>`);
	});

	const bars = opts.series.filter((s) => s.kind === "bar");
	const barW = bars.length ? (slot * 0.7) / bars.length : 0;
	bars.forEach((s, b) => {
		s.values.forEach((v, i) => {
			if (v === null || !Number.isFinite(v)) return;
			const left = x(i) - (slot * 0.7) / 2 + b * barW;
			const top = y(v);
			parts.push(
				`<rect x="${round(left)}" y="${round(top)}" width="${round(barW)}" height="${round(PAD.top + plotH - top)}" fill="${s.color}"><title>${esc(`${s.name} ${opts.labels[i]}: ${format(v)}`)}</title></rect>`
			);
		});
	});

	for (const s of opts.series.filter((s) => s.kind !== "bar")) {
		let path = "";
		let pen = false;
		s.values.forEach((v, i) => {
			if (v === null || !Number.isFinite(v)) {
				pen = false;
				return;
			}
			path += `${pen ? "L" : "M"}${round(x(i))} ${round(y(v))} `;
			pen = true;
		});
		if (path) {
			parts.push(`<path d="${path.trim()}" fill="none" stroke="${s.color}" stroke-width="2"${s.dashed ? ' stroke-dasharray="5 3"' : ""}/>`);
		}
		s.values.forEach((v, i) => {
			if (v === null || !Number.isFinite(v)) return;
			parts.push(`<circle cx="${round(x(i))}" cy="${round(y(v))}" r="2.5" fill="${s.color}"><title>${esc(`${s.name} ${opts.labels[i]}: ${format(v)}`)}</title></circle>`);
		});
	}

	(opts.thresholds ?? []).forEach((t, k) => {
		const yy = round(y(t.value));
		const color = t.color ?? "#dc2626";
		// Alternate label sides so two close thresholds (limit + amber margin) do not overprint.
		const right = k % 2 === 0;
		parts.push(`<line x1="${PAD.left}" x2="${PAD.left + plotW}" y1="${yy}" y2="${yy}" stroke="${color}" stroke-dasharray="4 3"/>`);
		parts.push(
			`<text x="${right ? PAD.left + plotW - 4 : PAD.left + 4}" y="${yy - 4}" text-anchor="${right ? "end" : "start"}" font-size="10" fill="${color}">${esc(t.label)}</text>`
		);
	});

	let lx = PAD.left;
	for (const s of opts.series) {
		parts.push(`<rect x="${lx}" y="10" width="10" height="10" fill="${s.color}"/>`);
		parts.push(`<text x="${lx + 14}" y="19" font-size="11" fill="#111827">${esc(s.name)}</text>`);
		lx += 22 + s.name.length * 6.2;
	}

	return `<figure class="chart"><svg role="img" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><title>${esc(opts.title)}</title>${parts.join("")}</svg><figcaption>${esc(opts.title)}</figcaption></figure>`;
}
