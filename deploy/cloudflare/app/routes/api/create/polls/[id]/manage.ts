import { defineHandler } from "void";
import { execute } from "../../../../../server/http";
export const GET = defineHandler((c) => {
  c.header("Cache-Control", "no-store");
  return execute(c, (s) => s.manage(c.req.param("id")!));
});
