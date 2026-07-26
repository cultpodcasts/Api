import { DurableObject } from "cloudflare:workers";
import { Env } from "./Env";

/**
 * Temporary migration target for renaming the KV-backed ProfileDurableObject
 * aside (preview-v2 / production-v2) before creating a SQLite-backed class with
 * the original name. Safe to delete from the codebase after preview-v3 /
 * production-v3 have been applied to every named env that needed the cutover.
 */
export class ProfileDurableObjectLegacy extends DurableObject {
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
	}
}
