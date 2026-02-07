import { z } from "@hono/zod-openapi";

// --- Common ---

export const errorSchema = z.object({
  error: z.string(),
});

// --- Auth ---

export const credentialsSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
});

export const userSchema = z.object({
  id: z.number(),
  username: z.string(),
  points: z.number(),
});

export const userResponseSchema = z.object({
  user: userSchema,
});

// --- Game ---

export const categorySchema = z.object({
  id: z.number(),
  name: z.string(),
  questionCount: z.number(),
});

export const categoriesResponseSchema = z.object({
  categories: z.array(categorySchema),
});

export const startGameSchema = z.object({
  categoryId: z.number(),
  wager: z.number().int().min(1),
});

export const roundSchema = z.object({
  id: z.number(),
  question: z.string(),
  options: z.array(z.string()),
});

export const roundResponseSchema = z.object({
  round: roundSchema,
});

export const answerRequestSchema = z.object({
  roundId: z.number(),
  answerIndex: z.number().int().min(0).max(3),
});

export const answerResponseSchema = z.object({
  correct: z.boolean(),
  correctIndex: z.number(),
  pointsDelta: z.number(),
  newBalance: z.number(),
});

// --- Stats ---

export const statsSchema = z.object({
  points: z.number(),
  gamesPlayed: z.number(),
  correct: z.number(),
  incorrect: z.number(),
  accuracy: z.number(),
});

export const leaderSchema = z.object({
  username: z.string(),
  points: z.number(),
});

export const leaderboardResponseSchema = z.object({
  leaders: z.array(leaderSchema),
});

// --- Inferred types for frontend ---

export type User = z.infer<typeof userSchema>;
export type Category = z.infer<typeof categorySchema>;
export type Round = z.infer<typeof roundSchema>;
export type AnswerResult = z.infer<typeof answerResponseSchema>;
export type Stats = z.infer<typeof statsSchema>;
export type Leader = z.infer<typeof leaderSchema>;
