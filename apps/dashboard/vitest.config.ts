import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    exclude: [".next/**", "node_modules/**"],
    coverage: {
      provider: "v8",
      reporter: ["json", "text"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
