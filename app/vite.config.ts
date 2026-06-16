import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Resolve @wstdiem/sdk source directly so the worktree can run without a
    // prior `npm --workspace sdk run build`. Production builds still respect
    // the workspace exports field.
    alias: {
      "@wstdiem/sdk": fileURLToPath(new URL("../sdk/src/index.ts", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 5173,
    strictPort: true,
  },
  build: {
    target: "es2022",
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          viem: ["viem"],
          wagmi: ["wagmi"],
          react: ["react", "react-dom", "react-router-dom"],
          charts: ["recharts", "@visx/visx"],
        },
      },
    },
  },
});
