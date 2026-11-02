import { defineHandler } from "void";
export const GET = defineHandler((c) => c.redirect("/create/connect", 302));
