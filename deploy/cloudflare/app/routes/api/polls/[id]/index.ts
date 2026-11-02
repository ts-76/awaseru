import { defineHandler } from "void";
import { execute } from "../../../../server/http";
export const GET = defineHandler((c) => execute(c, (s) => s.get(c.req.param("id")!)));
