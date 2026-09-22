/** Parse Cloudflare `cdn-cgi/trace` body into loc/colo (and raw). */

export type CdnCgiTrace = {
	raw: string;
	loc: string | null;
	colo: string | null;
};

export type ExpectedPop = {
	/** Allowed `loc=` values (country codes), e.g. ["US","GB"]. Empty = do not check loc. */
	locs?: string[];
	/** Allowed `colo=` values, e.g. ["IAD","LHR"]. Empty = do not check colo. */
	colos?: string[];
};

export function parseCdnCgiTrace(raw: string): CdnCgiTrace {
	const text = raw.trim();
	const loc = text.match(/^loc=(.+)$/m)?.[1]?.trim() ?? null;
	const colo = text.match(/^colo=(.+)$/m)?.[1]?.trim() ?? null;
	return { raw: text, loc, colo };
}

/**
 * True when observed trace satisfies allowlists.
 * If both locs and colos are empty/missing, returns false (must declare expectations).
 */
export function traceMatchesExpectedPop(
	trace: CdnCgiTrace,
	expected: ExpectedPop | null | undefined
): boolean {
	if (!expected) {
		return false;
	}
	const locs = (expected.locs ?? []).map((x) => x.trim().toUpperCase()).filter(Boolean);
	const colos = (expected.colos ?? []).map((x) => x.trim().toUpperCase()).filter(Boolean);
	if (locs.length === 0 && colos.length === 0) {
		return false;
	}
	if (locs.length > 0) {
		if (!trace.loc || !locs.includes(trace.loc.toUpperCase())) {
			return false;
		}
	}
	if (colos.length > 0) {
		if (!trace.colo || !colos.includes(trace.colo.toUpperCase())) {
			return false;
		}
	}
	return true;
}

export const CDN_CGI_TRACE_URL = "https://cloudflare.com/cdn-cgi/trace";
