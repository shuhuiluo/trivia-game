# Review Unit 1 — Author Preparation: Game Routes

## Unit Description

This review unit covers the game logic layer: category listing, round creation
(with wager validation and question selection), and answer evaluation (with
point adjustment and stats update).

### Files Under Review

| File                        | LOC | Role                                               |
| --------------------------- | --- | -------------------------------------------------- |
| `src/server/routes/game.ts` | 255 | Game route handlers (categories, start, answer)    |
| `src/shared/schemas.ts`     | 91  | Zod validation schemas shared by client and server |
| `tests/game.test.ts`        | 285 | Unit tests for game routes                         |

**Total: 631 LOC**

### Key Behaviors

1. **GET /api/categories** — Lists all categories with their question counts
   via a left join + group by.
2. **POST /api/game/start** — Authenticated. Validates wager (min 1, cannot
   exceed user's points). Selects a random question from the requested category,
   excluding recently answered questions. Falls back to repeats if all questions
   are exhausted. Returns 400 if the category has no questions at all.
3. **POST /api/game/answer** — Authenticated. Looks up the round (must belong
   to user, must not already be answered). Compares answer to correct index.
   Updates game round record and user stats (points, gamesPlayed,
   correctAnswers/incorrectAnswers) via two separate UPDATE statements.

## Test Strategy Summary

### Approach

Tests mock the Drizzle `db` module using Bun's `mock.module` with a Proxy-based
fake. Each chained query (select/insert/update/delete) resolves to the next
entry in a pre-configured results array. This lets us test route logic in
isolation without a running database.

### What Is Tested (13 tests)

| Area       | Tests                                                                                                                         |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Categories | Returns list with counts; handles empty                                                                                       |
| Start game | Success path; wager exceeds points; wager = 0 (Zod); fallback on exhaustion; empty category; unauthenticated; invalid session |
| Answer     | Correct (+wager); incorrect (-wager); round not found; already answered; unauthenticated; answerIndex out of range            |

### Coverage Goals

- All three route handlers exercised on success and error paths
- Auth middleware integration (401 for missing/invalid session)
- Zod schema validation (wager min, answerIndex range)
- Edge cases: question exhaustion fallback, empty category

## Known Limitations and Risks

1. **No real database** — Tests use a sequential mock, so they cannot verify
   actual SQL correctness (joins, where clauses, RANDOM() ordering). Bugs in
   query construction would not be caught.
2. **Stats update atomicity** — The handler issues two separate UPDATEs (game
   round, then user stats) without a transaction. A failure between the two
   would leave inconsistent state. Tests cannot detect this because the mock
   resolves both unconditionally.
3. **newBalance race condition** — `newBalance` is computed from the middleware's
   cached `user.points + pointsDelta`, not from the DB after the UPDATE. Under
   concurrent requests, the returned balance could be stale.
4. **No negative-balance guard** — A correct wager deduction could bring points
   below zero. The schema allows `wager >= 1` but does not enforce
   `wager <= points` at the Zod level (only in handler logic).
5. **Mock ordering is brittle** — Tests depend on the exact sequence of DB calls.
   Any refactor that reorders queries will break tests even if behavior is
   unchanged.
