/**
 * Tiny server-side inline-SVG charts for the soak page (cultpodcasts/Api#304). No dependency, no
 * client script: each chart is a self-contained `<svg>` with a `<title>` for screen readers. The
 * legend is HTML under the chart so it wraps on narrow screens; a chart with no values at all shows
 * a "No data yet" placeholder instead of empty axes.
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
	/** Shown instead of the chart when no series has a value. */
	emptyText?: string;
};

/** SVG font sizes (user units; the SVG is drawn at about 1:1 in the page grid). */
const AXIS_FONT = 14;
const MARK_FONT = 13;
const PAD = { top: 16, right: 16, bottom: 34, left: 70 };

function esc(value: string): string {
	return value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

const round = (n: number) => Math.round(n * 10) / 10;

const finite = (v: number | null): v is number => v !== null && Number.isFinite(v);

/** True when at least one series has at least one value. */
export function chartHasData(series: ChartSeries[]): boolean {
	return series.some((s) => s.values.some(finite));
}

function legend(series: ChartSeries[]): string {
	return `<ul class="chart-legend">${series
		.map(
			(s) =>
				`<li><svg width="22" height="12" aria-hidden="true">${
					s.kind === "bar"
						? `<rect x="5" y="0" width="12" height="12" rx="2" fill="${s.color}"/>`
						: `<line x1="0" x2="22" y1="6" y2="6" stroke="${s.color}" stroke-width="3"${s.dashed ? ' stroke-dasharray="5 3"' : ""}/>`
				}</svg>${esc(s.name)}</li>`
		)
		.join("")}</ul>`;
}

/** Round an axis top up to four round gridline steps (e.g. 902 → 1000 in 250s, 431 → 500 in 125s). */
export function niceCeiling(max: number, min = 0): number {
	const range = max - min;
	if (!(range > 0)) return max;
	const raw = range / 4;
	const mag = 10 ** Math.floor(Math.log10(raw));
	const step = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5, 8, 10].map((m) => m * mag).find((st) => st >= raw - 1e-9)!;
	return Number((min + 4 * step).toPrecision(12));
}

/** Render one chart. Null values leave a gap (line) or no bar. */
export function renderChart(opts: ChartOptions): string {
	const heading = `<h3>${esc(opts.title)}</h3>`;
	if (!chartHasData(opts.series)) {
		return `<figure class="chart chart-empty">${heading}<div class="chart-placeholder">${esc(opts.emptyText ?? "No data yet")}</div></figure>`;
	}
	const width = opts.width ?? 520;
	const height = opts.height ?? 260;
	const format = opts.format ?? ((v: number) => String(Math.round(v)));
	const plotW = width - PAD.left - PAD.right;
	const plotH = height - PAD.top - PAD.bottom;
	const all = opts.series.flatMap((s) => s.values).filter(finite);
	const marks = (opts.thresholds ?? []).map((t) => t.value);
	const yMin = opts.yMin ?? 0;
	let yMax = opts.yMax ?? niceCeiling(Math.max(...all, ...marks, 0) * 1.05, yMin);
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
		parts.push(`<line x1="${PAD.left}" x2="${PAD.left + plotW}" y1="${yy}" y2="${yy}" stroke="#eef0f3"/>`);
		parts.push(`<text x="${PAD.left - 8}" y="${yy + 5}" text-anchor="end" font-size="${AXIS_FONT}" fill="#4b5563">${esc(format(v))}</text>`);
	}
	const every = Math.ceil(n / 8);
	opts.labels.forEach((label, i) => {
		if (i % every !== 0) return;
		parts.push(`<text x="${round(x(i))}" y="${height - PAD.bottom + 22}" text-anchor="middle" font-size="${AXIS_FONT}" fill="#4b5563">${esc(label)}</text>`);
	});

	const bars = opts.series.filter((s) => s.kind === "bar");
	const barW = bars.length ? (slot * 0.7) / bars.length : 0;
	bars.forEach((s, b) => {
		s.values.forEach((v, i) => {
			if (!finite(v)) return;
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
			if (!finite(v)) {
				pen = false;
				return;
			}
			path += `${pen ? "L" : "M"}${round(x(i))} ${round(y(v))} `;
			pen = true;
		});
		if (path) {
			parts.push(`<path d="${path.trim()}" fill="none" stroke="${s.color}" stroke-width="2.5"${s.dashed ? ' stroke-dasharray="6 4"' : ""}/>`);
		}
		s.values.forEach((v, i) => {
			if (!finite(v)) return;
			parts.push(`<circle cx="${round(x(i))}" cy="${round(y(v))}" r="4" fill="${s.color}"><title>${esc(`${s.name} ${opts.labels[i]}: ${format(v)}`)}</title></circle>`);
		});
	}

	(opts.thresholds ?? []).forEach((t, k) => {
		const yy = round(y(t.value));
		const color = t.color ?? "#dc2626";
		// Alternate label sides so two close thresholds (limit + amber margin) do not overprint.
		const right = k % 2 === 0;
		parts.push(`<line x1="${PAD.left}" x2="${PAD.left + plotW}" y1="${yy}" y2="${yy}" stroke="${color}" stroke-width="1.5" stroke-dasharray="4 3"/>`);
		parts.push(
			`<text x="${right ? PAD.left + plotW - 6 : PAD.left + 6}" y="${yy - 6}" text-anchor="${right ? "end" : "start"}" font-size="${MARK_FONT}" font-weight="600" fill="${color}">${esc(t.label)}</text>`
		);
	});

	return `<figure class="chart">${heading}<svg role="img" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><title>${esc(opts.title)}</title>${parts.join("")}</svg>${legend(opts.series)}</figure>`;
}
