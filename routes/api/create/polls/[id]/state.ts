import { defineHandler } from "void";
import { execute } from "../../../../../server/http";
export const PATCH = defineHandler((c) =>
  execute(c, async (s) => s.ownerManageState(c.req.param("id")!, await c.req.json())),
);
