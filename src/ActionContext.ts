import { Context } from "hono";
import { BlankInput } from "hono/types";
import { Env } from "./Env";

export type ActionContext = Context<{ Bindings: Env; }, string, BlankInput>;

