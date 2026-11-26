import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: resolve(import.meta.dirname, "demo"),
  base: process.env.DEMO_BASE ?? "./",
  plugins: [react()],
  resolve: {
    alias: {
      "liquid-glass-tabbar/styles.css": resolve(
        import.meta.dirname,
        "src/styles.css",
      ),
      "liquid-glass-tabbar": resolve(import.meta.dirname, "src/index.ts"),
    },
  },
  build: {
    outDir: resolve(import.meta.dirname, "demo-dist"),
    emptyOutDir: true,
    sourcemap: true,
  },
});
