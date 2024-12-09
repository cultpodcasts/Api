import { Env } from "./Env";
import { DurableObject } from "cloudflare:workers";

export class ProfileDurableObject extends DurableObject {
    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env);
    }

    async sayHello(name: string): Promise<string> {
        return `Hello, ${name}!`;
    }
}
