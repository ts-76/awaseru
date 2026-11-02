import { defineEnv, string } from "void/env";
export default defineEnv({
  ACCESS_TEAM_DOMAIN: string().optional(),
  ACCESS_CREATE_AUD: string().optional(),
  ACCESS_MCP_AUD: string().optional(),
});
