import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Without this, vitest's default test-file glob also picks up the
    // compiled copies under dist/ after `npm run build`, running every
    // test twice (once from source, once from the build output).
    include: ["test/**/*.test.ts"],
  },
});
