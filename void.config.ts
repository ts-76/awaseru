// Deployment identifiers are build-time inputs, never Worker runtime bindings.
import { deploymentConfig } from "./scripts/deployment-config.mjs";
import { defineConfig } from "void/config";

export default defineConfig({
  cloudflare: deploymentConfig(),
  head: {
    title: "awaseru | 日程調整",
    htmlAttrs: { lang: "ja" },
    meta: [
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  },
  worker: {
    compatibility_date: "2026-02-24",
  },
});
