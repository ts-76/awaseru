import { defineHandler } from "void";
import { execute } from "../../../../server/http";
export const DELETE = defineHandler((c) =>
  execute(c, async (s) => s.delete(c.req.param("id")!, await c.req.json())),
);
export const PATCH = defineHandler((c) =>
  execute(c, async (s) => s.ownerState(c.req.param("id")!, await c.req.json())),
);
