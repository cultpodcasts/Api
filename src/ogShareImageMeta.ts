const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

function paddedDayMonth(year: string, month: string, day: string): string | undefined {
	const y = Number(year);
	const m = Number(month);
	const d = Number(day);
	if (!y || m < 1 || m > 12 || d < 1 || d > 31) {
		return undefined;
	}
	return `${d} ${MONTHS[m - 1]} ${y}`;
}

/**
 * Display date for OG cards: `24 Aug 2026`.
 * Accepts ISO (`2026-08-24` / `2026-08-24T…`), UK `dd/mm/yyyy`, or an already-localised string.
 */
export function formatOgReleaseDate(raw?: string): string | undefined {
	const value = raw?.trim();
	if (!value) {
		return undefined;
	}
	const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
	if (iso) {
		return paddedDayMonth(iso[1], iso[2], iso[3]) ?? value;
	}
	const uk = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
	if (uk) {
		return paddedDayMonth(uk[3], uk[2], uk[1]) ?? value;
	}
	return value;
}

/**
 * Clock-style duration: drop TimeSpan fractions and a leading zero hour (`00:51:28` → `51:28`).
 */
export function formatOgDuration(raw?: string): string | undefined {
	const value = raw?.trim();
	if (!value) {
		return undefined;
	}
	const core = value.split(".")[0];
	const parts = core.split(":");
	if (parts.length === 3) {
		const hours = Number(parts[0]);
		const minutes = parts[1];
		const seconds = parts[2];
		if (!Number.isFinite(hours) || minutes === undefined || seconds === undefined) {
			return core;
		}
		if (hours === 0) {
			return `${Number(minutes)}:${seconds}`;
		}
		return `${hours}:${minutes}:${seconds}`;
	}
	if (parts.length === 2) {
		return `${Number(parts[0])}:${parts[1]}`;
	}
	return core;
}
