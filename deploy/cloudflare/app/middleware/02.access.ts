import { defineMiddleware } from "void";
import { env } from "void/env";
import { accessGate } from "../server/access";
export default defineMiddleware(accessGate(() => env));
