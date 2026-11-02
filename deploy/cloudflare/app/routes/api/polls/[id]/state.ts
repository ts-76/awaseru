import { defineHandler } from "void";
import { execute, bearer } from "../../../../server/http";
export const PATCH = defineHandler((c) =>
  execute(c, async (s) => s.state(c.req.param("id")!, await c.req.json(), bearer(c))),
);
