import { DESKTOP_CHROME_UA } from "./browserRenderingHtml";

const VIDEO_API = "https://api.bitchute.com/api/beta/video";
const VIDEO_ID = /^[A-Za-z0-9_-]{6,}$/;

export function tryBcVideoIdFromUrl(url: URL): string | null {
	const host = url.hostname.replace(/^www\./i, "").toLowerCase();
	if (host !== "bitchute.com") {
		return null;
	}

	const parts = url.pathname.split("/").filter(Boolean);
	if (parts.length !== 2) {
		return null;
	}

	const [kind, id] = parts;
	if (kind.toLowerCase() !== "video" && kind.toLowerCase() !== "embed") {
		return null;
	}

	return VIDEO_ID.test(id) ? id : null;
}

export async function fetchBcVideoApiJson(
	url: URL,
	addMessage: (message: string) => void
): Promise<string | null> {
	const id = tryBcVideoIdFromUrl(url);
	if (!id) {
		addMessage("bitchute video id missing");
		return null;
	}

	try {
		const resp = await fetch(VIDEO_API, {
			method: "POST",
			headers: {
				Accept: "application/json",
				"Content-Type": "application/json",
				"User-Agent": DESKTOP_CHROME_UA,
				Referer: `https://www.bitchute.com/video/${id}/`
			},
			body: JSON.stringify({ video_id: id }),
			signal: AbortSignal.timeout(8_000)
		});
		addMessage(`bitchute video api status=${resp.status}`);
		if (!resp.ok) {
			return null;
		}

		const text = await resp.text();
		let parsed: { video_name?: unknown };
		try {
			parsed = JSON.parse(text) as { video_name?: unknown };
		} catch {
			addMessage("bitchute video api not json");
			return null;
		}

		if (typeof parsed.video_name !== "string" || !parsed.video_name.trim()) {
			addMessage("bitchute video api missing title");
			return null;
		}

		return text;
	} catch (e) {
		const detail = e instanceof Error ? e.message : String(e);
		addMessage(`bitchute video api failed: ${detail}`);
		return null;
	}
}
