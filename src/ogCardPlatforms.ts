export type OgPlatform = "youtube" | "spotify" | "apple" | "bbc";

const PLATFORM_ORDER: OgPlatform[] = ["youtube", "spotify", "apple", "bbc"];

/**
 * Platform marks from the website assets / `apple-podcasts-svg` component.
 * Each SVG fills a 24×24 footprint so chips render at equal optical size.
 */
const PLATFORM_ICON_SVG: Record<OgPlatform, string> = {
	// Site YouTube paths on a full-bleed rounded square (pill alone looks smaller than circles).
	youtube: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="5.4" fill="#F44336"/><path fill="#FAFAFA" d="M9.2 7.2v9.6l8.2-4.8z"/></svg>`,
	spotify: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="8" fill="#8BC34A"/><path fill="#37474F" d="M11.261 11.761c-.1 0-.2-.029-.287-.091-1.875-1.318-4.994-1.391-7.1-.9a.5.5 0 0 1-.226-.975c2.315-.536 5.775-.438 7.9 1.057a.5.5 0 0 1-.287.909zM12.239 9.805a.495.495 0 0 1-.292-.094C9.773 8.15 7.101 7.762 3.535 8.49a.5.5 0 1 1-.201-.98c3.857-.787 6.779-.347 9.197 1.388a.5.5 0 0 1-.292.907zM13.218 7.196a.501.501 0 0 1-.281-.086c-2.757-1.871-6.948-1.88-9.661-.92a.5.5 0 1 1-.333-.944C5.894 4.203 10.467 4.225 13.5 6.282a.5.5 0 0 1-.282.914z"/></svg>`,
	// Exact paths from website `apple-podcasts-svg.component.html` (circular purple gradient mark).
	apple: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 48 48"><rect width="48" height="48" fill="url(#og-apg)" rx="24"/><path fill="#fff" d="M23.788 8.68908C16.0715 8.80759 9.72449 14.9966 9.43479 22.7131C9.18459 29.363 13.4247 35.0779 19.3503 37.0794C19.482 37.119 19.6137 37.0136 19.5874 36.8688C19.5084 36.3289 19.4162 35.7758 19.3372 35.2227C19.3108 35.0647 19.2055 34.9199 19.0607 34.854C14.4782 32.892 11.2783 28.2963 11.3968 22.9764C11.5417 16.3529 16.8748 10.9276 23.4983 10.6643C30.6749 10.3878 36.6005 16.1422 36.6005 23.253C36.6005 28.4544 33.4402 32.9183 28.9367 34.854C28.7787 34.9199 28.6733 35.0516 28.6602 35.2227C28.5812 35.789 28.5022 36.342 28.41 36.8688C28.3836 37.0004 28.5153 37.119 28.647 37.0794C34.4146 35.1306 38.5757 29.679 38.5757 23.2661C38.5757 15.1546 31.9259 8.57056 23.788 8.68908Z"/><path fill="#fff" d="M24.0513 13.5349C18.6919 13.5086 14.2806 17.8935 14.2675 23.2529C14.2543 26.6503 15.9925 29.6395 18.6261 31.3908C18.7446 31.4698 18.9158 31.3777 18.9026 31.2328C18.85 30.5217 18.8105 29.8502 18.7973 29.2313C18.7973 29.0996 18.7446 28.9811 18.6393 28.8889C17.0854 27.4009 16.1373 25.2808 16.2427 22.9501C16.4139 18.9602 19.64 15.7208 23.63 15.5365C28.0808 15.3258 31.7547 18.8811 31.7547 23.2925C31.7547 25.5047 30.8329 27.4931 29.3449 28.9021C29.2527 28.9942 29.2001 29.1127 29.1869 29.2444C29.1737 29.8633 29.1342 30.5349 29.0816 31.246C29.0684 31.3908 29.2396 31.483 29.3581 31.404C31.9917 29.6658 33.7167 26.6766 33.7167 23.2925C33.7299 17.9199 29.3976 13.5612 24.0513 13.5349Z"/><path fill="#fff" d="M23.9987 25.5179C25.8968 25.5179 27.4355 23.9792 27.4355 22.081 27.4355 20.1829 25.8968 18.6442 23.9987 18.6442 22.1006 18.6442 20.5618 20.1829 20.5618 22.081 20.5618 23.9792 22.1006 25.5179 23.9987 25.5179zM27.4355 28.4938C26.6981 26.9663 25.1443 26.7425 23.9987 26.7425 22.8531 26.7425 21.2992 26.9663 20.5618 28.4938 19.8112 30.0477 21.1939 38.6464 21.6943 39.476 22.0893 40.1344 22.8136 40.6875 23.9987 40.6875 25.1838 40.6875 25.9081 40.1476 26.3031 39.476 26.8035 38.6464 28.1861 30.0477 27.4355 28.4938z"/><defs><linearGradient id="og-apg" x1="23.95" x2="23.544" y1="48.61" y2="0" gradientUnits="userSpaceOnUse"><stop stop-color="#822CBE"/><stop offset="1" stop-color="#D772FB"/></linearGradient></defs></svg>`,
	// Website BBC Sounds bars on a matching rounded square chip.
	bbc: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="5.4" fill="#1a1a1a"/><svg x="3" y="3.2" width="18" height="17.6" viewBox="0 6 348 336" preserveAspectRatio="xMidYMid meet"><g transform="translate(-76 -82)"><path fill="#A13104" d="M122,304H78c-0.552,0-1.052-0.224-1.414-0.586S76,302.552,76,302v-92c0-0.552,0.224-1.052,0.586-1.414S77.448,208,78,208h44c0.552,0,1.052,0.224,1.414,0.586S124,209.448,124,210v92c0,0.552-0.224,1.052-0.586,1.414S122.552,304,122,304z"/><path fill="#D24712" d="M230,376h-80c-0.552,0-1.052-0.224-1.414-0.586S148,374.552,148,374V138c0-0.552,0.224-1.052,0.586-1.414S149.448,136,150,136h80c0.552,0,1.052,0.224,1.414,0.586S232,137.448,232,138v236c0,0.552-0.224,1.052-0.586,1.414S230.552,376,230,376z"/><path fill="#FA6400" d="M422,424H258c-0.552,0-1.052-0.224-1.414-0.586S256,422.552,256,422V90c0-0.552,0.224-1.052,0.586-1.414S257.448,88,258,88h164c0.552,0,1.052,0.224,1.414,0.586S424,89.448,424,90v332c0,0.552-0.224,1.052-0.586,1.414S422.552,424,422,424z"/></g></svg></svg>`
};

function svgToDataUrl(svg: string): string {
	return `data:image/svg+xml;base64,${btoa(svg)}`;
}

export function parseOgPlatforms(value: string | undefined | null): OgPlatform[] {
	if (!value?.trim()) {
		return [];
	}
	const set = new Set(
		value
			.split(",")
			.map((p) => p.trim().toLowerCase())
			.filter((p): p is OgPlatform =>
				p === "youtube" || p === "spotify" || p === "apple" || p === "bbc"
			)
	);
	return PLATFORM_ORDER.filter((p) => set.has(p));
}

export function serializeOgPlatforms(platforms: OgPlatform[]): string {
	return PLATFORM_ORDER.filter((p) => platforms.includes(p)).join(",");
}

/** Infer platforms from search / KV fields without rewriting records. */
export function inferOgPlatforms(fields: {
	youtube?: string | null;
	youtubeId?: string | null;
	spotify?: string | null;
	apple?: string | null;
	bbc?: string | null;
	image?: string | null;
}): OgPlatform[] {
	const out: OgPlatform[] = [];
	if (fields.youtube || fields.youtubeId) {
		out.push("youtube");
	}
	if (fields.spotify || (fields.image?.startsWith("s") && fields.image.length > 1 && !fields.image.startsWith("http"))) {
		out.push("spotify");
	}
	if (fields.apple || (fields.image?.startsWith("a") && fields.image.length > 1 && !fields.image.startsWith("http"))) {
		out.push("apple");
	}
	if (fields.bbc) {
		out.push("bbc");
	}
	return PLATFORM_ORDER.filter((p) => out.includes(p));
}

export function platformIconDataUrl(platform: OgPlatform): string {
	return svgToDataUrl(PLATFORM_ICON_SVG[platform]);
}
