import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { desc } from "drizzle-orm";

import {
  errorSchema,
  leaderboardResponseSchema,
  statsSchema,
} from "../../shared/schemas.ts";
import { db } from "../db";
import { users } from "../db/schema.ts";
import { authMiddleware, type AuthEnv } from "../middleware/auth.ts";

// --- Routes ---

const statsRoute = createRoute({
  method: "get",
  path: "/api/stats",
  middleware: [authMiddleware] as const,
  responses: {
    200: {
      content: { "application/json": { schema: statsSchema } },
      description: "User stats",
    },
    401: {
      content: { "application/json": { schema: errorSchema } },
      description: "Not authenticated",
    },
  },
});

const leaderboardRoute = createRoute({
  method: "get",
  path: "/api/leaderboard",
  responses: {
    200: {
      content: { "application/json": { schema: leaderboardResponseSchema } },
      description: "Top 10 users by points",
    },
  },
});

// --- App ---

const app = new OpenAPIHono<AuthEnv>();

app.openapi(statsRoute, async c => {
  const user = c.var.user;

  const accuracy =
    user.gamesPlayed > 0 ? user.correctAnswers / user.gamesPlayed : 0;

  return c.json(
    {
      points: user.points,
      gamesPlayed: user.gamesPlayed,
      correct: user.correctAnswers,
      incorrect: user.incorrectAnswers,
      accuracy,
    },
    200
  );
});

app.openapi(leaderboardRoute, async c => {
  const result = await db
    .select({
      username: users.username,
      points: users.points,
    })
    .from(users)
    .orderBy(desc(users.points))
    .limit(10);

  return c.json({ leaders: result }, 200);
});

export default app;
