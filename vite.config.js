import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  root: "client",
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        secure: false,
      },
      "/uploads": {
        target: "http://localhost:3000",
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    rollupOptions: {
      input: {
        index: path.resolve("client/index.html"),
        client: path.resolve("client/client.html"),
        administrator: path.resolve("client/administrator.html"),
        verifier: path.resolve("client/verifier.html"),
      },
    },
  },
});
