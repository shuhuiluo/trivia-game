import { and, eq, gt } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";

import { db } from "../db/index.ts";
import { sessions, users } from "../db/schema.ts";

export type AuthEnv = {
  Variables: {
    user: {
      id: number;
      username: string;
      points: number;
      gamesPlayed: number;
      correctAnswers: number;
      incorrectAnswers: number;
    };
  };
};

export const authMiddleware: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const token = getCookie(c, "session");

  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const result = await db
    .select({
      userId: users.id,
      username: users.username,
      points: users.points,
      gamesPlayed: users.gamesPlayed,
      correctAnswers: users.correctAnswers,
      incorrectAnswers: users.incorrectAnswers,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, token), gt(sessions.expiresAt, new Date())))
    .limit(1);

  const row = result[0];

  if (!row) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  c.set("user", {
    id: row.userId,
    username: row.username,
    points: row.points,
    gamesPlayed: row.gamesPlayed,
    correctAnswers: row.correctAnswers,
    incorrectAnswers: row.incorrectAnswers,
  });

  await next();
};
