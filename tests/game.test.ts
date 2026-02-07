import { beforeEach, describe, expect, mock, test } from "bun:test";

import gameApp from "../src/server/routes/game.ts";
import {
  DB_MOCK_FACTORY,
  jsonRequest,
  MOCK_QUESTION,
  MOCK_ROUND,
  MOCK_USER,
  setMockResults,
} from "./helpers.ts";

// Must be in the test file itself — hoisting only applies to the calling file
mock.module("../src/server/db/index.ts", () => DB_MOCK_FACTORY());

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Shorthand for an authenticated POST with JSON body. */
function authedPost(path: string, body: object) {
  return gameApp.request(
    path,
    jsonRequest("POST", body, "session=valid-token")
  );
}

// ---------------------------------------------------------------------------
// GET /api/categories
// ---------------------------------------------------------------------------

describe("GET /api/categories", () => {
  beforeEach(() => setMockResults([]));

  test("returns categories with question counts", async () => {
    setMockResults([
      // select: categories with question counts
      [
        { id: 1, name: "Science", questionCount: 5 },
        { id: 2, name: "History", questionCount: 3 },
      ],
    ]);

    const res = await gameApp.request("/api/categories");
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.categories).toHaveLength(2);
    expect(json.categories[0].name).toBe("Science");
    expect(json.categories[0].questionCount).toBe(5);
    expect(json.categories[1].name).toBe("History");
  });

  test("returns empty list when no categories exist", async () => {
    setMockResults([[]]);

    const res = await gameApp.request("/api/categories");
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.categories).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// POST /api/game/start
// ---------------------------------------------------------------------------

describe("POST /api/game/start", () => {
  beforeEach(() => setMockResults([]));

  test("starts a game round successfully", async () => {
    setMockResults([
      [MOCK_USER], // middleware: session lookup
      [], // select: recently answered (none)
      [MOCK_QUESTION], // select: random question
      [{ id: 42 }], // insert: create game round
    ]);

    const res = await authedPost("/api/game/start", {
      categoryId: 1,
      wager: 10,
    });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.round.id).toBe(42);
    expect(json.round.question).toBe("What is 2+2?");
    expect(json.round.options).toEqual(["1", "2", "3", "4"]);
  });

  test("rejects wager exceeding available points", async () => {
    setMockResults([
      [MOCK_USER], // middleware: session lookup (user has 100 points)
    ]);

    const res = await authedPost("/api/game/start", {
      categoryId: 1,
      wager: 200, // exceeds 100 points
    });
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error).toContain("Wager exceeds");
  });

  test("rejects wager of zero or negative", async () => {
    // Auth middleware runs before Zod validation on authenticated routes
    setMockResults([
      [MOCK_USER], // middleware: session lookup
    ]);

    const res = await authedPost("/api/game/start", {
      categoryId: 1,
      wager: 0,
    });
    expect(res.status).toBe(400);
  });

  test("falls back to repeat questions when all exhausted", async () => {
    setMockResults([
      [MOCK_USER], // middleware: session lookup
      [{ questionId: 1 }], // select: recently answered (all done)
      [], // select: random question (none left)
      [MOCK_QUESTION], // select: fallback (repeat allowed)
      [{ id: 99 }], // insert: create game round
    ]);

    const res = await authedPost("/api/game/start", {
      categoryId: 1,
      wager: 5,
    });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.round.id).toBe(99);
  });

  test("returns 400 when question options JSON is malformed", async () => {
    setMockResults([
      [MOCK_USER], // middleware: session lookup
      [], // select: recently answered (none)
      [{ ...MOCK_QUESTION, options: "not-valid-json" }], // malformed options
      // no round INSERT — parse fails before it
    ]);

    const res = await authedPost("/api/game/start", {
      categoryId: 1,
      wager: 10,
    });
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error).toContain("Invalid question data");
  });

  test("returns 400 when category has no questions at all", async () => {
    setMockResults([
      [MOCK_USER], // middleware: session lookup
      [], // select: recently answered (none)
      [], // select: random question (empty category)
      [], // select: fallback (also empty)
    ]);

    const res = await authedPost("/api/game/start", {
      categoryId: 999,
      wager: 5,
    });
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error).toContain("No questions available");
  });

  test("returns 401 without authentication", async () => {
    setMockResults([]);

    const res = await gameApp.request(
      "/api/game/start",
      jsonRequest("POST", { categoryId: 1, wager: 10 })
    );
    expect(res.status).toBe(401);
  });

  test("returns 401 with invalid session token", async () => {
    setMockResults([
      [], // middleware: session lookup returns nothing
    ]);

    const res = await authedPost("/api/game/start", {
      categoryId: 1,
      wager: 10,
    });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /api/game/answer
// ---------------------------------------------------------------------------

describe("POST /api/game/answer", () => {
  beforeEach(() => setMockResults([]));

  test("awards points for correct answer", async () => {
    setMockResults([
      [MOCK_USER], // middleware: session lookup
      [MOCK_ROUND], // select: find round (wager=10, not yet answered)
      [MOCK_QUESTION], // select: find question (correctIndex=3)
      undefined, // tx update: game round
      [{ points: 110 }], // tx update: user stats (.returning)
    ]);

    const res = await authedPost("/api/game/answer", {
      roundId: 1,
      answerIndex: 3, // correct
    });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.correct).toBe(true);
    expect(json.correctIndex).toBe(3);
    expect(json.pointsDelta).toBe(10);
    expect(json.newBalance).toBe(110);
  });

  test("deducts points for incorrect answer", async () => {
    setMockResults([
      [MOCK_USER], // middleware: session lookup
      [MOCK_ROUND], // select: find round (wager=10)
      [MOCK_QUESTION], // select: find question (correctIndex=3)
      undefined, // tx update: game round
      [{ points: 90 }], // tx update: user stats (.returning)
    ]);

    const res = await authedPost("/api/game/answer", {
      roundId: 1,
      answerIndex: 0, // incorrect (correct is 3)
    });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.correct).toBe(false);
    expect(json.correctIndex).toBe(3);
    expect(json.pointsDelta).toBe(-10);
    expect(json.newBalance).toBe(90);
  });

  test("returns 400 when round not found", async () => {
    setMockResults([
      [MOCK_USER], // middleware: session lookup
      [], // select: round not found
    ]);

    const res = await authedPost("/api/game/answer", {
      roundId: 999,
      answerIndex: 0,
    });
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error).toContain("Round not found");
  });

  test("returns 400 when round already answered", async () => {
    setMockResults([
      [MOCK_USER], // middleware: session lookup
      [{ ...MOCK_ROUND, answerIndex: 2, correct: true }], // select: round already answered
    ]);

    const res = await authedPost("/api/game/answer", {
      roundId: 1,
      answerIndex: 0,
    });
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error).toContain("already answered");
  });

  test("returns 401 without authentication", async () => {
    setMockResults([]);

    const res = await gameApp.request(
      "/api/game/answer",
      jsonRequest("POST", { roundId: 1, answerIndex: 0 })
    );
    expect(res.status).toBe(401);
  });

  test("rejects answerIndex out of range", async () => {
    // Auth middleware runs before Zod validation on authenticated routes
    setMockResults([
      [MOCK_USER], // middleware: session lookup
    ]);

    const res = await authedPost("/api/game/answer", {
      roundId: 1,
      answerIndex: 5,
    });
    expect(res.status).toBe(400);
  });
});
