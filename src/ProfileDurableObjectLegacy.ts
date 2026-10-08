import { DurableObject } from "cloudflare:workers";
import { Env } from "./Env";

/**
 * Rename target for the existing ProfileDurableObject (preview-v2,
 * production-v2, and top-level v2) before a SQLite class reuses the original
 * name. Do not delete this class in the same migration that creates the
 * SQLite class. A delete is only legal after a later deploy has removed the
 * legacy binding. Top-level Worker `api` does not include that delete.
 */
export class ProfileDurableObjectLegacy extends DurableObject {
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
	}
}
