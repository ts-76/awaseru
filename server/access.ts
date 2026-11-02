import type { MiddlewareHandler } from "hono";
import { hash } from "./rules";
import "./context";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export type AccessConfig = {
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_CREATE_AUD?: string;
  ACCESS_MCP_AUD?: string;
};
type Purpose = "create" | "mcp";
const ownerEmail = "ts.createlink@gmail.com";
const keySets = new Map<string, JWTVerifyGetKey>();
function configuration(config: AccessConfig, purpose: Purpose) {
  const domain = config.ACCESS_TEAM_DOMAIN;
  const createAud = config.ACCESS_CREATE_AUD;
  const mcpAud = config.ACCESS_MCP_AUD;
  if (
    !domain ||
    !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.cloudflareaccess\.com$/.test(domain) ||
    !createAud ||
    !mcpAud ||
    createAud === mcpAud ||
    !/^[a-f0-9]{64}$/.test(createAud) ||
    !/^[a-f0-9]{64}$/.test(mcpAud)
  )
    return null;
  return { issuer: `https://${domain}`, audience: purpose === "create" ? createAud : mcpAud };
}
function remoteKey(issuer: string) {
  let keys = keySets.get(issuer);
  if (!keys) {
    keys = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`), { timeoutDuration: 5000 });
    keySets.set(issuer, keys);
  }
  return keys;
}
function protectedPurpose(pathname: string): Purpose | undefined {
  // Decode routing spellings before checking the boundary. Never infer identity from the URL.
  let path = pathname;
  for (let i = 0; i < 3; i++) {
    try {
      const decoded = decodeURIComponent(path);
      if (decoded === path) break;
      path = decoded;
    } catch {
      break;
    }
  }
  path = path.replace(/\/{2,}/g, "/").replace(/\/+$/, "");
  if (
    path === "/create" ||
    path.startsWith("/create/") ||
    path === "/api/create" ||
    path.startsWith("/api/create/")
  )
    return "create";
  if (path === "/mcp" || path.startsWith("/mcp/")) return "mcp";
}
/** Key resolver injection is for signed-key unit tests; production always uses the configured team JWKS. */
export function accessGate(config: () => AccessConfig, keys?: JWTVerifyGetKey): MiddlewareHandler {
  return async (c, next) => {
    const purpose = protectedPurpose(new URL(c.req.url).pathname);
    if (!purpose) return next();
    c.header("Cache-Control", "no-store");
    const settings = configuration(config(), purpose);
    if (!settings)
      return c.json({ error: "認証の設定が完了していません。", code: "auth_unconfigured" }, 503);
    const assertion = c.req.header("Cf-Access-Jwt-Assertion");
    if (!assertion) return c.json({ error: "ログインが必要です。", code: "auth_required" }, 401);
    let email: unknown;
    let ownerId: string;
    try {
      const { payload } = await jwtVerify(assertion, keys ?? remoteKey(settings.issuer), {
        issuer: settings.issuer,
        audience: settings.audience,
        algorithms: ["RS256"],
        requiredClaims: ["exp", "sub", "email"],
      });
      if (
        typeof payload.sub !== "string" ||
        !payload.sub.trim() ||
        typeof payload.email !== "string" ||
        !payload.email
      )
        throw new Error("Missing identity");
      email = payload.email;
      ownerId = await hash(JSON.stringify([settings.issuer, payload.sub]));
    } catch {
      return c.json(
        { error: "認証を確認できません。再度ログインしてください。", code: "auth_invalid" },
        401,
      );
    }
    if (email !== ownerEmail)
      return c.json({ error: "このアカウントでは利用できません。", code: "auth_forbidden" }, 403);
    if (purpose === "create" && /^(POST|PUT|PATCH|DELETE)$/.test(c.req.method)) {
      if (c.req.header("Origin") !== new URL(c.req.url).origin)
        return c.json({ error: "このアクセス元からは操作できません。" }, 403);
      if (c.req.header("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json")
        return c.json({ error: "JSON形式で送信してください。" }, 415);
    }
    c.set("ownerId", ownerId);
    return next();
  };
}
