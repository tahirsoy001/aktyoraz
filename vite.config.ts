import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 3010,
    proxy: {
      "/api": "http://localhost:4010",
      "/og": "http://localhost:4010",
      "/robots.txt": "http://localhost:4010",
      "/sitemap.xml": "http://localhost:4010",
      "/uploads": "http://localhost:4010",
    },
  },
  preview: {
    port: 3010,
  },
});
