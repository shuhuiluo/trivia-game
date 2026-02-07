import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { and, count, eq, notInArray, sql } from "drizzle-orm";

import { db } from "../db";
import { categories, gameRounds, questions, users } from "../db/schema.ts";
import { authMiddleware, type AuthEnv } from "../middleware/auth.ts";

// --- Schemas ---

const categorySchema = z.object({
  id: z.number(),
  name: z.string(),
  questionCount: z.number(),
});

const roundResponseSchema = z.object({
  round: z.object({
    id: z.number(),
    question: z.string(),
    options: z.array(z.string()),
  }),
});

const answerResponseSchema = z.object({
  correct: z.boolean(),
  correctIndex: z.number(),
  pointsDelta: z.number(),
  newBalance: z.number(),
});

const errorSchema = z.object({
  error: z.string(),
});

// --- Routes ---

const categoriesRoute = createRoute({
  method: "get",
  path: "/api/categories",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ categories: z.array(categorySchema) }),
        },
      },
      description: "List of categories with question counts",
    },
  },
});

const startRoute = createRoute({
  method: "post",
  path: "/api/game/start",
  middleware: [authMiddleware] as const,
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            categoryId: z.number(),
            wager: z.number().int().min(1),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: roundResponseSchema } },
      description: "Game round started",
    },
    400: {
      content: { "application/json": { schema: errorSchema } },
      description: "Invalid wager or no questions available",
    },
    401: {
      content: { "application/json": { schema: errorSchema } },
      description: "Not authenticated",
    },
  },
});

const answerRoute = createRoute({
  method: "post",
  path: "/api/game/answer",
  middleware: [authMiddleware] as const,
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            roundId: z.number(),
            answerIndex: z.number().int().min(0).max(3),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: answerResponseSchema } },
      description: "Answer evaluated",
    },
    400: {
      content: { "application/json": { schema: errorSchema } },
      description: "Round not found or already answered",
    },
    401: {
      content: { "application/json": { schema: errorSchema } },
      description: "Not authenticated",
    },
  },
});

// --- App ---

const app = new OpenAPIHono<AuthEnv>();

app.openapi(categoriesRoute, async c => {
  const result = await db
    .select({
      id: categories.id,
      name: categories.name,
      questionCount: count(questions.id),
    })
    .from(categories)
    .leftJoin(questions, eq(categories.id, questions.categoryId))
    .groupBy(categories.id, categories.name);

  return c.json({ categories: result }, 200);
});

app.openapi(startRoute, async c => {
  const { categoryId, wager } = c.req.valid("json");
  const user = c.var.user;

  if (wager > user.points) {
    return c.json({ error: "Wager exceeds your available points" }, 400);
  }

  // Get question IDs the user has recently answered in this category
  const recentlyAnswered = await db
    .select({ questionId: gameRounds.questionId })
    .from(gameRounds)
    .innerJoin(questions, eq(gameRounds.questionId, questions.id))
    .where(
      and(eq(gameRounds.userId, user.id), eq(questions.categoryId, categoryId))
    );

  const excludeIds = recentlyAnswered.map(r => r.questionId);

  // Pick a random question not recently answered
  const questionQuery = db
    .select()
    .from(questions)
    .where(
      excludeIds.length > 0
        ? and(
            eq(questions.categoryId, categoryId),
            notInArray(questions.id, excludeIds)
          )
        : eq(questions.categoryId, categoryId)
    )
    .orderBy(sql`RANDOM()`)
    .limit(1);

  const questionResult = await questionQuery;
  let question = questionResult[0];

  // If all questions exhausted, allow repeats
  if (!question) {
    const fallback = await db
      .select()
      .from(questions)
      .where(eq(questions.categoryId, categoryId))
      .orderBy(sql`RANDOM()`)
      .limit(1);

    question = fallback[0];
  }

  if (!question) {
    return c.json({ error: "No questions available in this category" }, 400);
  }

  const [round] = await db
    .insert(gameRounds)
    .values({
      userId: user.id,
      questionId: question.id,
      wager,
    })
    .returning({ id: gameRounds.id });

  if (!round) {
    return c.json({ error: "Failed to create game round" }, 400);
  }

  const options: string[] = JSON.parse(question.options);

  return c.json(
    {
      round: {
        id: round.id,
        question: question.questionText,
        options,
      },
    },
    200
  );
});

app.openapi(answerRoute, async c => {
  const { roundId, answerIndex } = c.req.valid("json");
  const user = c.var.user;

  // Find the round
  const roundResult = await db
    .select()
    .from(gameRounds)
    .where(and(eq(gameRounds.id, roundId), eq(gameRounds.userId, user.id)))
    .limit(1);

  const round = roundResult[0];

  if (!round) {
    return c.json({ error: "Round not found" }, 400);
  }

  if (round.answerIndex !== null) {
    return c.json({ error: "Round already answered" }, 400);
  }

  // Look up the question
  const questionResult = await db
    .select()
    .from(questions)
    .where(eq(questions.id, round.questionId))
    .limit(1);

  const question = questionResult[0];

  if (!question) {
    return c.json({ error: "Question not found" }, 400);
  }

  const correct = answerIndex === question.correctIndex;
  const pointsDelta = correct ? round.wager : -round.wager;

  // Update the game round
  await db
    .update(gameRounds)
    .set({ answerIndex, correct, pointsDelta })
    .where(eq(gameRounds.id, roundId));

  // Update user points and stats
  await db
    .update(users)
    .set({
      points: sql`${users.points} + ${pointsDelta}`,
      gamesPlayed: sql`${users.gamesPlayed} + 1`,
      correctAnswers: correct
        ? sql`${users.correctAnswers} + 1`
        : users.correctAnswers,
      incorrectAnswers: correct
        ? users.incorrectAnswers
        : sql`${users.incorrectAnswers} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));

  const newBalance = user.points + pointsDelta;

  return c.json(
    {
      correct,
      correctIndex: question.correctIndex,
      pointsDelta,
      newBalance,
    },
    200
  );
});

export default app;
