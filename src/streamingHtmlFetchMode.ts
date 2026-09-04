/**
 * Single implementation lives in the published contract fixture
 * (`tests/fixtures/streaming-submit-contract.ts`). Re-export so the Worker
 * cannot drift from website/RPP copies of the same rule.
 */
export {
	htmlFetchModeForService,
	type HtmlFetchMode
} from "../tests/fixtures/streaming-submit-contract";
