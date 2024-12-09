import { BookmarkRequest } from "./BookmarkRequest";
import { Env } from "./Env";
import { DurableObject } from "cloudflare:workers";

export class ProfileDurableObject extends DurableObject {
    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env);
    }

    async bookmark(bookmarkRequest:BookmarkRequest):Promise<boolean> {
        return true;
    }
}
