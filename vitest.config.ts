import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { environment: "node", include: ["tests/**/*.test.ts"], fileParallelism: false, env: { TOKEN_HASH_KEY: "vitest-only-key-with-more-than-thirty-two-characters", DATABASE_PATH: "./runtime/vitest.sqlite", MEDIA_STORAGE_DIR: "./runtime/vitest-media" } },
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
});
