import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { leetcodeMiddleware } from "./server/leetcode.mjs";
import { activityMiddleware } from "./server/activity.mjs";
export default defineConfig({
  plugins: [
    react(),
    {
      name: "office-hours-leetcode",
      configureServer(server) {
        server.middlewares.use(activityMiddleware());
        server.middlewares.use(leetcodeMiddleware());
      },
      configurePreviewServer(server) {
        server.middlewares.use(activityMiddleware());
        server.middlewares.use(leetcodeMiddleware());
      },
    },
  ],
});
