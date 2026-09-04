export type HtmlFetchMode = "directHttp" | "browserRendering";

/** BR allowlist check — same rule as contract htmlFetchModeForService. */
export function htmlFetchModeForService(
	service: string,
	browserRenderingServices: readonly string[]
): HtmlFetchMode {
	return browserRenderingServices.includes(service) ? "browserRendering" : "directHttp";
}
