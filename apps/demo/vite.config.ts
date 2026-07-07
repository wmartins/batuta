import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [reactRouter()],
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    port: 5174,
  },
  ssr: {
    noExternal: ["@astryxdesign/core", "@astryxdesign/theme-neutral"],
  },
});
