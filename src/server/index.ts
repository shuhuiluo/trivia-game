import { OpenAPIHono } from "@hono/zod-openapi";

// eslint-disable-next-line import-x/no-unresolved
import homepage from "../../client/index.html";
import authRoutes from "./routes/auth.ts";
import gameRoutes from "./routes/game.ts";
import statsRoutes from "./routes/stats.ts";

const app = new OpenAPIHono();

app.route("/", authRoutes);
app.route("/", gameRoutes);
app.route("/", statsRoutes);

app.doc("/doc", {
  openapi: "3.0.0",
  info: {
    title: "Trivia Game API",
    version: "1.0.0",
  },
});

Bun.serve({
  port: 3000,
  routes: {
    "/": homepage,
  },
  fetch: app.fetch,
});

console.log("Server running on http://localhost:3000");
