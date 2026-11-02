import { defineHandler } from "void";
import { execute } from "../../../../server/http";
export const GET = defineHandler((c) => execute(c, (s) => s.list(c.req.query("cursor"))));
