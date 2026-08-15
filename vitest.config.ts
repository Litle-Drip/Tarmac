import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: [
      // Server modules import each other with explicit .js extensions so the
      // bundled output resolves at runtime. Map those back to the TypeScript
      // sources when running tests.
      { find: /^(\.{1,2}\/.*)\.js$/, replacement: "$1" },
      { find: "@shared", replacement: path.resolve(__dirname, "shared") },
      { find: "@", replacement: path.resolve(__dirname, "client/src") },
    ],
  },
  test: {
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", "dist/**", ".vercel/**"],
  },
});
