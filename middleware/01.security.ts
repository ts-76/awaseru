import { defineMiddleware } from "void";
import { bodyLimit } from "hono/body-limit";
export default defineMiddleware(async (c, next) => {
  c.header("Cache-Control", "no-store");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  const origin = c.req.header("Origin");
  if (origin && origin !== new URL(c.req.url).origin)
    return c.json({ error: "このアクセス元からは操作できません。" }, 403);
  if (Number(c.req.header("Content-Length") || 0) > 32768)
    return c.json({ error: "送信内容が大きすぎます。" }, 413);
  if (c.req.path.startsWith("/api/"))
    return bodyLimit({
      maxSize: 32768,
      onError: (c) => c.json({ error: "送信内容が大きすぎます。" }, 413),
    })(c, next);
  await next();
});
