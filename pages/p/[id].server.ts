import { defineHandler, type InferProps } from "void";
import { HTTPException } from "hono/http-exception";
export const loader = defineHandler(async (c) => {
  const id = c.req.param("id")!;
  const found = await c.env.DB.prepare("SELECT id FROM polls WHERE id=? AND status!='deleted'")
    .bind(id)
    .first<{ id: string }>();
  if (!found) throw new HTTPException(404, { message: "この日程調整は見つかりません。" });
  return { id };
});
export type Props = InferProps<typeof loader>;
