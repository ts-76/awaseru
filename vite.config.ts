import { defineConfig } from "vite-plus";
import { voidPlugin } from "void";
import { voidReact } from "@void/react/plugin";

const notAppCode = [
  ".claude/**",
  ".agents/**",
  ".harness/**",
  ".void/**",
  "db/migrations/**",
  "deploy/cloudflare/**",
];

export default defineConfig({
  fmt: { ignorePatterns: notAppCode },
  lint: { ignorePatterns: notAppCode },
  plugins: [voidPlugin(), voidReact({ react: { compiler: true } })],
});
