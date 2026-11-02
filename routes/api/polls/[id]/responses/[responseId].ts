import { defineHandler } from "void";
import { execute, bearer } from "../../../../../server/http";
export const PATCH = defineHandler((c) =>
  execute(c, async (s) =>
    s.update(c.req.param("id")!, c.req.param("responseId")!, await c.req.json(), bearer(c)),
  ),
);
