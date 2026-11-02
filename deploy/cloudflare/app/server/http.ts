import type { CloudContext } from "void";
import type { Context } from "hono";
import { AppError } from "./rules";
import { SchedulingService } from "./service";
export function bearer(c: Context) {
  return c.req.header("Authorization")?.replace(/^Bearer /, "") || "";
}
export async function execute(c: CloudContext, fn: (s: SchedulingService) => Promise<unknown>) {
  try {
    return c.json(await fn(new SchedulingService(c.env.DB, c.get("ownerId"))));
  } catch (e) {
    if (e instanceof AppError) return c.json({ error: e.message, code: e.code }, e.status as 400);
    if (e instanceof SyntaxError) return c.json({ error: "JSONの形式を確認してください。" }, 400);
    console.error("Scheduling operation failed");
    return c.json({ error: "保存に失敗しました。入力を保持して、もう一度お試しください。" }, 500);
  }
}
