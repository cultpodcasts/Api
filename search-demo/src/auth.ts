import { parseJwt } from "@cfworker/jwt";

export interface AuthEnv {
  AUTH0_DOMAIN: string;
  AUTH0_AUDIENCE: string;
  REQUIRED_PERMISSIONS: string; // comma-separated; any one grants access
}

export type AuthResult =
  | { ok: true; sub: string; permissions: string[] }
  | { ok: false; status: 401 | 403; reason: string };

/**
 * Same model as the production api Worker's Auth0Middleware: validate the RS256
 * access token against the tenant issuer + audience with @cfworker/jwt, then
 * authorise on the access-token `permissions[]` claim (not ID-token roles).
 */
export async function authorize(request: Request, env: AuthEnv): Promise<AuthResult> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return { ok: false, status: 401, reason: "missing bearer token" };
  }
  const issuer = `https://${env.AUTH0_DOMAIN}/`;
  const result = await parseJwt(token, issuer, env.AUTH0_AUDIENCE);
  if (!result.valid) {
    return { ok: false, status: 401, reason: "invalid token" };
  }
  const payload = result.payload as { sub: string; permissions?: string[] };
  const permissions = payload.permissions ?? [];
  const required = env.REQUIRED_PERMISSIONS.split(",").map((p) => p.trim()).filter(Boolean);
  if (required.length && !required.some((p) => permissions.includes(p))) {
    return { ok: false, status: 403, reason: `requires one of: ${required.join(", ")}` };
  }
  return { ok: true, sub: payload.sub, permissions };
}
