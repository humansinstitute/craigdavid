import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // listen on all interfaces so external devices can connect
    port: 5180,
    strictPort: true,
    hmr: {
      host: "dev.otherstuff.studio",
      port: 5180,
    },
  },
  preview: {
    host: true,
    port: 5180,
    strictPort: true,
  },
});
