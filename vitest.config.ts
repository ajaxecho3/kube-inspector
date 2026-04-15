import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    environmentMatchGlobs: [
      ["tests/hooks/**", "jsdom"],
      ["tests/components/**", "jsdom"],
    ],
  },
});
