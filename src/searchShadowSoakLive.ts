export type LiveResponse = {
	/** `Response.type`: `opaqueredirect` when the docs gate redirects to login (`redirect: "manual"`). */
	type: string;
	status: number;
	ok: boolean;
	/** The refetched page has the `#soak-live` swap target (the error pages do not). */
	hasTarget: boolean;
};

export type LiveAction = "expire" | "retry" | "swap";

/**
 * The live refresh decision, as plain JavaScript. This is interpolated into `LIVE_REFRESH_SCRIPT`
 * and evaluated in Node tests — never taken from Function#toString() of a bundled function.
 */
export const LIVE_REFRESH_DECIDE_JS = `function decide(r) {
	if (r.type === "opaqueredirect" || r.status === 401 || r.status === 403) return "expire";
	if (!r.ok || !r.hasTarget) return "retry";
	return "swap";
}`;

/**
 * Plain JavaScript shipped in the soak page's inline <script>. This string is the single source of
 * truth for the browser refresh decision and loop. Wrangler/esbuild `keepNames` can inject `__name`
 * helpers into compiled functions; those helpers do not exist in the page, so this source must stay
 * a string (not Function#toString()).
 */
export const LIVE_REFRESH_SCRIPT = `(() => {
	${LIVE_REFRESH_DECIDE_JS}
	const box = document.getElementById("soak-live");
	const status = document.getElementById("live-status");
	const toggle = document.getElementById("live-toggle");
	if (!box || !status || !toggle) return;
	let paused = false;
	let stopped = false;
	let busy = false;
	let timer = 0;
	const stamp = () => {
		const g = box.getAttribute("data-generated");
		return g ? new Date(g).toISOString().slice(11, 19) + " UTC" : "";
	};
	const show = () => {
		status.textContent = (paused ? "Paused" : "Live") + " · updated " + stamp();
		status.className = paused ? "live-dot paused" : "live-dot";
		toggle.textContent = paused ? "Resume" : "Pause";
	};
	const expire = () => {
		stopped = true;
		clearInterval(timer);
		status.className = "live-dot stopped";
		status.innerHTML = 'Session expired · <a href="">reload</a>';
		toggle.hidden = true;
	};
	async function tick() {
		if (paused || stopped || busy || document.hidden) return;
		busy = true;
		try {
			const r = await fetch(location.href, { credentials: "same-origin", redirect: "manual", cache: "no-store", headers: { accept: "text/html" } });
			const next = r.ok ? new DOMParser().parseFromString(await r.text(), "text/html").getElementById("soak-live") : null;
			const action = decide({ type: r.type, status: r.status, ok: r.ok, hasTarget: !!next });
			if (action === "expire") return expire();
			if (action === "retry" || !next) {
				status.textContent = "Update failed · retrying in a minute";
				return;
			}
			box.innerHTML = next.innerHTML;
			box.setAttribute("data-generated", next.getAttribute("data-generated") || "");
			show();
		} catch (e) {
			status.textContent = "Offline · retrying in a minute";
		} finally {
			busy = false;
		}
	}
	timer = setInterval(tick, 60000);
	toggle.addEventListener("click", () => {
		paused = !paused;
		show();
		if (!paused) tick();
	});
	document.addEventListener("visibilitychange", () => {
		if (!document.hidden) tick();
	});
	show();
})();`;

