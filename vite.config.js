import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  root: "client",
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:3000",
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
