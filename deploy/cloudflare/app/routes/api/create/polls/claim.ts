import { defineHandler } from "void";
import { execute } from "../../../../server/http";
export const POST = defineHandler((c) => execute(c, async (s) => s.claim(await c.req.json())));
