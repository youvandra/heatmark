import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The API runs on :8796; in production nginx serves the same /api prefix.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5196,
    proxy: { "/api": { target: "http://localhost:8796", rewrite: (p) => p.replace(/^\/api/, "") } },
  },
});
