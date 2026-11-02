import { defineHandler } from "void";
/** Reached only after the Access gate verified the owner; public pages use it to reveal the admin nav. */
export const GET = defineHandler((c) => c.json({ signedIn: true }));
