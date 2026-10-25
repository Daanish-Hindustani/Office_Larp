import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { leetcodeMiddleware } from "./server/leetcode.mjs";
import { activityMiddleware } from "./server/activity.mjs";
import { multiplayerMiddleware } from "./server/multiplayer.mjs";
export default defineConfig({
  plugins: [
    react(),
    {
      name: "office-hours-leetcode",
      configureServer(server) {
        const multiplayer = multiplayerMiddleware();
        server.middlewares.use(multiplayer);
        server.httpServer?.once("close", multiplayer.close);
        server.middlewares.use(activityMiddleware());
        server.middlewares.use(leetcodeMiddleware());
      },
      configurePreviewServer(server) {
        const multiplayer = multiplayerMiddleware();
        server.middlewares.use(multiplayer);
        server.httpServer?.once("close", multiplayer.close);
        server.middlewares.use(activityMiddleware());
        server.middlewares.use(leetcodeMiddleware());
      },
    },
  ],
});
