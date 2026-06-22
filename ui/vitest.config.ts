import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Match the tsconfig `@/*` path alias so tests can import like app code does.
  resolve: { alias: { "@": resolve(here) } },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});
