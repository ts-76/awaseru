import { defineHandler } from "void";
export const POST = defineHandler((c) => c.json({ error: "この作成URLは使用できません。" }, 410));
