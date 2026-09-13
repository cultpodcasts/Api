/**
 * Single implementation lives in the published contract fixture
 * (`tests/fixtures/streaming-submit-contract.ts`). Re-export so the Worker
 * cannot drift from website/RPP copies of the same rule.
 */
export {
	htmlFetchModeForService,
	type HtmlFetchMode
} from "../tests/fixtures/streaming-submit-contract";

/**
 * Worker POSTs the host video JSON API then Azure extract before HTML prepare.
 * Not an `htmlFetchMode` — do not add to the published fixture unless website
 * re-copies it. Next host Azure UK cannot POST grows this helper, not a
 * service-string ladder in `submitPrepare`.
 */
export function workerPrefetchesVideoJson(service: string): boolean {
	return service === "bitchute";
}

/**
 * Worker GETs catalogue HTML then Azure extract before Azure prepare.
 * Not an `htmlFetchMode` — do not add to the published fixture unless website
 * re-copies it. Hosts Azure UK cannot fetch (geo wall) grow this helper.
 */
export function workerPrefetchesCatalogHtml(service: string): boolean {
	return service === "tubi";
}
