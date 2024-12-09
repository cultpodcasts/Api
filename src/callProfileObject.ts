import { ActionContext } from "./ActionContext";

export async function callProfileObject(c: ActionContext): Promise<Response> {
    let id: DurableObjectId = c.env.PROFILE_DURABLE_OBJECT.idFromName(new URL(c.req.url).pathname);
    let stub = c.env.PROFILE_DURABLE_OBJECT.get(id);
    let greeting = await stub.sayHello("world");
    return new Response(greeting);
}
