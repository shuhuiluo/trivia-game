/**
 * System tests — full request-response cycles through the combined Hono app.
 *
 * These exercise the complete API surface (auth -> game -> stats -> leaderboard)
 * in realistic multi-step flows, verifying that the routes, middleware, and
 * schemas compose correctly end-to-end.
 */
import { OpenAPIHono } from "@hono/zod-openapi";
import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";

import authRoutes from "../src/server/routes/auth.ts";
import gameRoutes from "../src/server/routes/game.ts";
import statsRoutes from "../src/server/routes/stats.ts";
import {
  DB_MOCK_FACTORY,
  getSessionCookie,
  jsonRequest,
  MOCK_QUESTION,
  MOCK_ROUND,
  MOCK_USER,
  setMockResults,
} from "./helpers.ts";

// Must be in the test file itself — hoisting only applies to the calling file
mock.module("../src/server/db/index.ts", () => DB_MOCK_FACTORY());

// Build the combined app (mirrors src/server/index.ts without Bun.serve)
const app = new OpenAPIHono();
app.route("/", authRoutes);
app.route("/", gameRoutes);
app.route("/", statsRoutes);

let testPasswordHash: string;

beforeAll(async () => {
  testPasswordHash = await Bun.password.hash("password123");
});

// ---------------------------------------------------------------------------
// Full gameplay flow
// ---------------------------------------------------------------------------

describe("Full gameplay flow", () => {
  beforeEach(() => setMockResults([]));

  test("register -> start game -> correct answer -> stats -> leaderboard", async () => {
    // ---- 1. Register ----
    setMockResults([
      [{ id: 1, username: "player1", points: 100 }], // insert: create user
      undefined, // insert: create session
    ]);

    const registerRes = await app.request(
      "/api/auth/register",
      jsonRequest("POST", { username: "player1", password: "password123" })
    );
    expect(registerRes.status).toBe(200);

    const registerJson = await registerRes.json();
    expect(registerJson.user.points).toBe(100);

    const sessionToken = getSessionCookie(registerRes);
    expect(sessionToken).toBeTruthy();
    const cookie = `session=${sessionToken}`;

    // ---- 2. List categories ----
    setMockResults([
      [
        { id: 1, name: "Science", questionCount: 5 },
        { id: 2, name: "History", questionCount: 5 },
      ],
    ]);

    const catRes = await app.request("/api/categories");
    expect(catRes.status).toBe(200);
    const catJson = await catRes.json();
    expect(catJson.categories.length).toBeGreaterThan(0);

    // ---- 3. Start game round ----
    setMockResults([
      [MOCK_USER], // middleware: session lookup
      [], // select: recently answered (none)
      [MOCK_QUESTION], // select: random question
      [{ id: 1 }], // insert: create round
    ]);

    const startRes = await app.request(
      "/api/game/start",
      jsonRequest("POST", { categoryId: 1, wager: 10 }, cookie)
    );
    expect(startRes.status).toBe(200);

    const startJson = await startRes.json();
    expect(startJson.round.id).toBe(1);
    expect(startJson.round.options).toHaveLength(4);

    // ---- 4. Submit correct answer ----
    setMockResults([
      [MOCK_USER], // middleware: session lookup
      [MOCK_ROUND], // select: find round (wager=10, unanswered)
      [MOCK_QUESTION], // select: find question (correctIndex=3)
      undefined, // tx update: game round
      [{ points: 110 }], // tx update: user stats (.returning)
    ]);

    const answerRes = await app.request(
      "/api/game/answer",
      jsonRequest("POST", { roundId: 1, answerIndex: 3 }, cookie)
    );
    expect(answerRes.status).toBe(200);

    const answerJson = await answerRes.json();
    expect(answerJson.correct).toBe(true);
    expect(answerJson.pointsDelta).toBe(10);
    expect(answerJson.newBalance).toBe(110);

    // ---- 5. Check stats ----
    const updatedUser = {
      ...MOCK_USER,
      points: 110,
      gamesPlayed: 1,
      correctAnswers: 1,
    };

    setMockResults([
      [updatedUser], // middleware: session lookup (returns updated stats)
    ]);

    const statsRes = await app.request("/api/stats", {
      headers: { Cookie: cookie },
    });
    expect(statsRes.status).toBe(200);

    const statsJson = await statsRes.json();
    expect(statsJson.points).toBe(110);
    expect(statsJson.gamesPlayed).toBe(1);
    expect(statsJson.correct).toBe(1);
    expect(statsJson.accuracy).toBe(1.0);

    // ---- 6. Check leaderboard ----
    setMockResults([[{ username: "player1", points: 110 }]]);

    const lbRes = await app.request("/api/leaderboard");
    expect(lbRes.status).toBe(200);

    const lbJson = await lbRes.json();
    expect(lbJson.leaders).toHaveLength(1);
    expect(lbJson.leaders[0].username).toBe("player1");
    expect(lbJson.leaders[0].points).toBe(110);
  });

  test("register -> start game -> wrong answer -> stats reflect loss", async () => {
    // ---- 1. Register ----
    setMockResults([
      [{ id: 2, username: "player2", points: 100 }], // insert: create user
      undefined, // insert: create session
    ]);

    const registerRes = await app.request(
      "/api/auth/register",
      jsonRequest("POST", { username: "player2", password: "secret123" })
    );
    expect(registerRes.status).toBe(200);
    const cookie = `session=${getSessionCookie(registerRes)}`;

    // ---- 2. Start game round ----
    setMockResults([
      [{ ...MOCK_USER, userId: 2, username: "player2" }],
      [],
      [MOCK_QUESTION],
      [{ id: 2 }],
    ]);

    const startRes = await app.request(
      "/api/game/start",
      jsonRequest("POST", { categoryId: 1, wager: 20 }, cookie)
    );
    expect(startRes.status).toBe(200);

    // ---- 3. Submit wrong answer ----
    setMockResults([
      [{ ...MOCK_USER, userId: 2, username: "player2" }],
      [{ ...MOCK_ROUND, id: 2, userId: 2, wager: 20 }],
      [MOCK_QUESTION], // correctIndex=3
      undefined, // tx update: game round
      [{ points: 80 }], // tx update: user stats (.returning)
    ]);

    const answerRes = await app.request(
      "/api/game/answer",
      jsonRequest("POST", { roundId: 2, answerIndex: 0 }, cookie) // wrong
    );
    expect(answerRes.status).toBe(200);

    const answerJson = await answerRes.json();
    expect(answerJson.correct).toBe(false);
    expect(answerJson.pointsDelta).toBe(-20);
    expect(answerJson.newBalance).toBe(80);

    // ---- 4. Check stats ----
    setMockResults([
      [
        {
          ...MOCK_USER,
          userId: 2,
          username: "player2",
          points: 80,
          gamesPlayed: 1,
          incorrectAnswers: 1,
        },
      ],
    ]);

    const statsRes = await app.request("/api/stats", {
      headers: { Cookie: cookie },
    });
    expect(statsRes.status).toBe(200);

    const statsJson = await statsRes.json();
    expect(statsJson.points).toBe(80);
    expect(statsJson.incorrect).toBe(1);
    expect(statsJson.accuracy).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Auth session flows
// ---------------------------------------------------------------------------

describe("Session handling", () => {
  beforeEach(() => setMockResults([]));

  test("login after registration uses same user data", async () => {
    // Register
    setMockResults([
      [{ id: 1, username: "combo", points: 100 }], // insert: create user
      undefined, // insert: create session
    ]);

    const regRes = await app.request(
      "/api/auth/register",
      jsonRequest("POST", { username: "combo", password: "password123" })
    );
    expect(regRes.status).toBe(200);

    // Login with same credentials
    setMockResults([
      [
        {
          id: 1,
          username: "combo",
          passwordHash: testPasswordHash,
          points: 100,
          gamesPlayed: 0,
          correctAnswers: 0,
          incorrectAnswers: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      undefined, // create session
    ]);

    const loginRes = await app.request(
      "/api/auth/login",
      jsonRequest("POST", { username: "combo", password: "password123" })
    );
    expect(loginRes.status).toBe(200);

    const loginJson = await loginRes.json();
    expect(loginJson.user.username).toBe("combo");
    expect(loginJson.user.id).toBe(1);

    const token = getSessionCookie(loginRes);
    expect(token).toBeTruthy();
  });

  test("unauthenticated requests to protected endpoints return 401", async () => {
    // /api/game/start without cookie
    const startRes = await app.request(
      "/api/game/start",
      jsonRequest("POST", { categoryId: 1, wager: 10 })
    );
    expect(startRes.status).toBe(401);

    // /api/game/answer without cookie
    const answerRes = await app.request(
      "/api/game/answer",
      jsonRequest("POST", { roundId: 1, answerIndex: 0 })
    );
    expect(answerRes.status).toBe(401);

    // /api/stats without cookie
    const statsRes = await app.request("/api/stats");
    expect(statsRes.status).toBe(401);
  });

  test("logout then access protected endpoint returns 401", async () => {
    // Logout
    setMockResults([undefined]); // delete session
    const logoutRes = await app.request("/api/auth/logout", {
      method: "POST",
      headers: { Cookie: "session=old-token" },
    });
    expect(logoutRes.status).toBe(200);

    // Try to use the old token — middleware returns empty
    setMockResults([
      [], // middleware: session not found
    ]);

    const meRes = await app.request("/api/auth/me", {
      headers: { Cookie: "session=old-token" },
    });
    expect(meRes.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Leaderboard (public)
// ---------------------------------------------------------------------------

describe("GET /api/leaderboard", () => {
  beforeEach(() => setMockResults([]));

  test("returns top users sorted by points", async () => {
    setMockResults([
      [
        { username: "champ", points: 500 },
        { username: "runner", points: 300 },
        { username: "third", points: 100 },
      ],
    ]);

    const res = await app.request("/api/leaderboard");
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.leaders).toHaveLength(3);
    expect(json.leaders[0].username).toBe("champ");
    expect(json.leaders[0].points).toBe(500);
  });

  test("returns empty leaderboard when no users exist", async () => {
    setMockResults([[]]);

    const res = await app.request("/api/leaderboard");
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.leaders).toHaveLength(0);
  });
});
