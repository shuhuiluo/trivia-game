import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  points: integer("points").notNull().default(100),
  gamesPlayed: integer("games_played").notNull().default(0),
  correctAnswers: integer("correct_answers").notNull().default(0),
  incorrectAnswers: integer("incorrect_answers").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
});

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
});

export const questions = pgTable("questions", {
  id: serial("id").primaryKey(),
  categoryId: integer("category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "cascade" }),
  questionText: text("question_text").notNull(),
  options: text("options").notNull(), // JSON-encoded string array
  correctIndex: integer("correct_index").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const gameRounds = pgTable("game_rounds", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  questionId: integer("question_id")
    .notNull()
    .references(() => questions.id, { onDelete: "cascade" }),
  wager: integer("wager").notNull(),
  answerIndex: integer("answer_index"),
  correct: boolean("correct"),
  pointsDelta: integer("points_delta"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
