# Review Log — Unit 1: Game Routes

**Reviewer:** Reviewer A
**Focus:** Logic, edge cases, tests
**Files reviewed:**

| File                        | LOC |
| --------------------------- | --- |
| `src/server/routes/game.ts` | 255 |
| `src/shared/schemas.ts`     | 91  |
| `tests/game.test.ts`        | 285 |

**Total: 631 LOC**
**Date:** 2026-02-07
**Time spent:** 2 min 11 sec (AI-assisted)
**Review iteration:** 1

## Reviewer Metrics

| Metric                 | Value |
| ---------------------- | ----- |
| Total issues found     | 12    |
| Blockers               | 0     |
| Majors                 | 5     |
| Minors                 | 6     |
| Nits                   | 1     |
| Code issues            | 5     |
| Test issues            | 5     |
| Design issues          | 2     |
| Issues per review-hour | 329   |
| Defects per 1,000 LOC  | 19.0  |
| % test-related         | 41.7% |
| % high-severity (M+B)  | 41.7% |

## Findings

| ID   | File           | Location      | Severity | Category | Description                                                                                                                                           | Resolution    |
| ---- | -------------- | ------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| G-01 | `game.ts`      | line 242      | Major    | Code     | `newBalance` computed from stale cached `user.points`, not from DB after UPDATE                                                                       | Fixed (PR #2) |
| G-02 | `game.ts`      | lines 221-240 | Major    | Design   | Two UPDATE statements (game round + user stats) are not wrapped in a transaction                                                                      | Fixed (PR #2) |
| G-03 | `game.ts`      | line 169      | Major    | Code     | `JSON.parse(question.options)` has no try/catch; corrupted DB data crashes the handler                                                                | Fixed (PR #2) |
| G-04 | `schemas.ts`   | line 55       | Minor    | Design   | `answerIndex` hardcoded to `.max(3)` assumes all questions have exactly 4 options                                                                     | Deferred      |
| G-05 | `game.ts`      | line 230      | Minor    | Code     | No guard against user points going negative after a lost wager                                                                                        | Deferred      |
| G-06 | `game.test.ts` | all           | Major    | Test     | No test verifies that DB mutations receive correct arguments (wager, pointsDelta, userId)                                                             | Deferred      |
| G-07 | `game.test.ts` | all           | Major    | Test     | No test for `JSON.parse` failure when `question.options` is malformed                                                                                 | Fixed (PR #2) |
| G-08 | `game.test.ts` | all           | Minor    | Test     | No test for a wager that exactly equals `user.points` (boundary value)                                                                                | Deferred      |
| G-09 | `game.test.ts` | line 77       | Minor    | Test     | MOCK_USER uses `userId` field but auth middleware maps it to `user.id`; naming inconsistency obscures what the mock represents                        | Deferred      |
| G-10 | `schemas.ts`   | line 40       | Minor    | Design   | `startGameSchema.wager` has no upper bound at the schema level; relies solely on handler-level check                                                  | Deferred      |
| G-11 | `game.ts`      | lines 112-135 | Nit      | Code     | "Recently answered" has no time bound -- it excludes all questions ever answered by the user in the category, not just recent ones                    | Deferred      |
| G-12 | `game.test.ts` | lines 167-177 | Minor    | Test     | "Invalid session token" test sends a valid cookie format (`session=valid-token`) but sets mock to return empty; does not test malformed cookie values | Deferred      |

## Detailed Findings

### G-01: `newBalance` computed from stale cached user points

**File:** `src/server/routes/game.ts` **Line:** 242 **Severity:** Major **Category:** Code

The answer handler computes `newBalance` as:

```ts
const newBalance = user.points + pointsDelta;
```

where `user.points` was read by the auth middleware at request start. Meanwhile, the actual DB update on line 230 uses `sql\`${users.points} + ${pointsDelta}\``which reads the current DB value. If two requests are in flight concurrently for the same user, the DB gets the correct atomic update, but the response returns a stale`newBalance` to the client. This can mislead the frontend into displaying an incorrect point balance.

**Suggested fix:** Read the updated `points` value back from the DB after the UPDATE (e.g., using `.returning()`) and return that value as `newBalance`.

---

### G-02: Non-atomic multi-table update in answer handler

**File:** `src/server/routes/game.ts` **Lines:** 221-240 **Severity:** Major **Category:** Design

The answer handler performs two separate UPDATE statements:

1. Update `gameRounds` with the answer result (line 221-224)
2. Update `users` with point and stat changes (line 227-240)

These are not wrapped in a database transaction. If the process crashes or the second UPDATE fails (e.g., connection error), the game round will be marked as answered but the user's points and stats will not be updated. This leaves the system in an inconsistent state with no recovery mechanism. The user would lose their wager entry without any points being adjusted.

**Suggested fix:** Wrap both UPDATEs in a `db.transaction()` call.

---

### G-03: Unguarded `JSON.parse` on question options

**File:** `src/server/routes/game.ts` **Line:** 169 **Severity:** Major **Category:** Code

```ts
const options: string[] = JSON.parse(question.options);
```

If the `options` column contains malformed JSON (corrupted data, empty string, wrong encoding), this line will throw an unhandled exception and return a 500 to the client. There is no try/catch or validation that the parsed result is actually an array of strings.

**Suggested fix:** Wrap in try/catch and validate the parsed structure, or use `z.array(z.string()).safeParse()` on the result. Return a 400/500 with a meaningful error if parsing fails.

---

### G-04: `answerIndex` schema hardcodes max of 3

**File:** `src/shared/schemas.ts` **Line:** 55 **Severity:** Minor **Category:** Design

```ts
answerIndex: z.number().int().min(0).max(3),
```

This assumes every question has exactly 4 options (indices 0-3). If the game ever supports questions with a different number of options (e.g., true/false with 2 options, or extended questions with 5+), this schema will either reject valid answers or accept out-of-bounds indices. Additionally, the handler on line 217 of `game.ts` does not validate `answerIndex` against the actual length of `question.options` -- it simply compares against `correctIndex`.

**Suggested fix:** Either (a) enforce a 4-option invariant in the question-creation pipeline and document this assumption, or (b) remove `.max(3)` from the schema and validate `answerIndex < options.length` in the handler after parsing options.

---

### G-05: User points can go negative

**File:** `src/server/routes/game.ts` **Line:** 230 **Severity:** Minor **Category:** Code

The wager check on line 107 ensures `wager <= user.points` at request time:

```ts
if (wager > user.points) {
  return c.json({ error: "Wager exceeds your available points" }, 400);
}
```

However, under concurrency, two requests could both pass this check with stale point values. After both losing wagers are applied via `sql\`${users.points} + ${pointsDelta}\``, the user's points in the DB could drop below zero. There is no CHECK constraint on the `users.points` column or any DB-level guard.

**Impact:** Users could accumulate negative balances, which may break game logic or UI assumptions elsewhere.

**Suggested fix:** Add a PostgreSQL CHECK constraint (`points >= 0`) on the users table, or use a conditional UPDATE with a WHERE clause like `WHERE points + ${pointsDelta} >= 0`.

---

### G-06: Tests never verify DB mutation arguments

**File:** `tests/game.test.ts` **Lines:** all **Severity:** Major **Category:** Test

The Proxy-based mock in `helpers.ts` silently ignores all arguments to `.where()`, `.set()`, `.values()`, etc. Tests only verify the HTTP response based on pre-configured mock return values. This means:

- A bug that writes `pointsDelta` to the wrong column would not be caught
- A bug that updates the wrong user (`eq(users.id, someWrongValue)`) would not be caught
- A bug that omits the `userId` filter on the round lookup would not be caught

The mock infrastructure provides no mechanism to assert what arguments were passed to DB calls.

**Suggested fix:** Enhance the mock to capture call arguments (e.g., record the arguments passed to `.set()`, `.where()`, `.values()`) and add assertions in tests that verify the correct parameters were used.

---

### G-07: No test for malformed `question.options` JSON

**File:** `tests/game.test.ts` **Lines:** all **Severity:** Major **Category:** Test

There is no test that covers the case where `question.options` is not valid JSON. The `JSON.parse` call on line 169 of `game.ts` is a crash point. A test with `options: "not-json"` or `options: ""` in `MOCK_QUESTION` would reveal whether the handler degrades gracefully or returns a 500.

**Suggested fix:** Add a test case with a mock question whose `options` field is malformed, and assert that the response is a controlled error (400 or 500 with an error message), not an unhandled crash.

---

### G-08: Missing boundary test for wager equal to points

**File:** `tests/game.test.ts` **Lines:** all **Severity:** Minor **Category:** Test

The tests cover `wager > points` (200 > 100 rejected) and `wager = 0` (rejected by Zod). However, there is no test for `wager === points` (e.g., wager = 100 when user has 100 points). This is a critical boundary: the guard on line 107 uses `>` (strictly greater), so `wager === points` should be allowed. A boundary test would confirm this.

**Suggested fix:** Add a test with `wager: 100` for a user with 100 points and assert it succeeds (status 200).

---

### G-09: MOCK_USER field naming inconsistency

**File:** `tests/helpers.ts` **Line:** 77 **Severity:** Minor **Category:** Test

```ts
export const MOCK_USER = {
  userId: 1,    // <-- named "userId"
  username: "testuser",
  points: 100,
  ...
};
```

The auth middleware maps the DB result to `c.set("user", { id: row.userId, ... })`, meaning the mock's `userId` field ends up as `user.id` in the handler context. However, in `game.ts` line 105, the handler accesses `user.id`. The mock uses `userId` because it mirrors the raw DB join result shape, but the naming mismatch between mock data and the handler's `user.id` makes tests harder to reason about. A reader might assume the mock directly represents `c.var.user`, when it actually represents the raw DB row.

**Suggested fix:** Add a comment to `MOCK_USER` clarifying that it represents the raw session-join DB row (not the `c.var.user` shape), or provide a separate `MOCK_AUTH_USER` that matches the `AuthEnv` type.

---

### G-10: No upper bound on wager in Zod schema

**File:** `src/shared/schemas.ts` **Line:** 40 **Severity:** Minor **Category:** Design

```ts
wager: z.number().int().min(1),
```

The schema enforces `wager >= 1` but has no upper bound. While the handler checks `wager > user.points`, having a reasonable schema-level max (e.g., `.max(10000)`) would provide defense in depth and prevent absurdly large numbers from reaching handler logic. It would also improve the OpenAPI documentation by communicating valid ranges to API consumers.

**Suggested fix:** Add a `.max()` constraint that matches the maximum possible points a user could have, or at least a reasonable sanity bound.

---

### G-11: "Recently answered" excludes all-time history, not just recent

**File:** `src/server/routes/game.ts` **Lines:** 112-135 **Severity:** Nit **Category:** Code

The comment on line 111 says "recently answered" but the query on lines 112-118 has no time filter:

```ts
const recentlyAnswered = await db
  .select({ questionId: gameRounds.questionId })
  .from(gameRounds)
  .innerJoin(questions, eq(gameRounds.questionId, questions.id))
  .where(
    and(eq(gameRounds.userId, user.id), eq(questions.categoryId, categoryId))
  );
```

This retrieves every question the user has ever answered in the category, not just "recently" answered ones. The fallback on lines 141-150 compensates for this by allowing repeats when all questions are exhausted, but the misleading comment could confuse future developers. Additionally, in categories with many questions, this query could return a large `excludeIds` array, potentially hitting query-size limits.

**Suggested fix:** Either add a time-based filter (e.g., last N rounds or last 24 hours) to match the "recently" semantics, or update the comment to say "previously answered" to match the actual behavior.

---

### G-12: Invalid session test does not cover malformed cookie formats

**File:** `tests/game.test.ts` **Lines:** 167-177 **Severity:** Minor **Category:** Test

The "invalid session token" test sends a well-formed cookie (`session=valid-token`) and relies on the DB mock returning an empty array. This only tests the case where the session token is not found in the database. It does not test:

- A cookie with an empty value (`session=`)
- A cookie with special characters or injection attempts (`session='; DROP TABLE sessions;--`)
- Missing cookie header entirely with a POST body that tries to fake auth

The test at line 157 covers the "no cookie at all" case, but adversarial and malformed inputs are not exercised.

**Suggested fix:** Add test cases with edge-case cookie values to verify the auth middleware handles them safely.

## Checklist Results

### Code Review Checklist

#### Correctness & Logic

- [x] Logic matches requirements and intent
- [ ] Edge cases handled explicitly -- points can go negative (G-05); `JSON.parse` unguarded (G-03); no `answerIndex` bounds check against actual options length (G-04)
- [ ] No hidden assumptions -- hardcoded 4-option assumption in schema (G-04); "recently answered" comment vs actual behavior (G-11)
- [x] Error paths tested or justified

#### Design & Architecture

- [x] Clear separation of concerns
- [ ] No unnecessary coupling -- schema hardcodes `.max(3)` coupling answer validation to a fixed question format (G-04)
- [x] Interfaces are stable and meaningful
- [x] Dependencies are injectable/mockable

#### Readability & Maintainability

- [x] Clear naming and structure
- [x] Functions are small and focused
- [ ] Comments explain _why_, not _what_ -- "recently answered" comment is misleading (G-11)
- [x] No dead or duplicate code

#### Performance & Robustness

- [ ] No obvious performance pitfalls -- `excludeIds` array grows unbounded over user lifetime (G-11)
- [ ] Resource handling is correct -- no transaction around multi-table update (G-02)
- [ ] Thread safety (if applicable) -- stale `newBalance` under concurrency (G-01); negative points race (G-05)

### Unit Test Review Checklist

#### Test Coverage & Intent

- [x] All public behaviors are tested
- [ ] Boundary and failure cases included -- missing wager-equals-points boundary test (G-08); no malformed JSON test (G-07)
- [x] Tests align with requirements
- [ ] Coverage gaps are justified -- no DB argument verification (G-06)

#### Test Quality

- [x] Tests are deterministic
- [x] One logical assertion per test (where possible)
- [x] Tests are readable and intention-revealing
- [ ] No brittle or over-mocked tests -- mock is entirely sequence-based; any query reorder breaks all tests (acknowledged in author prep as known limitation)

#### Isolation & Dependencies

- [x] External dependencies are mocked or stubbed
- [ ] No hidden reliance on shared state -- `globalThis.__db` is shared mutable state; tests rely on exact call ordering
- [x] Setup/teardown is minimal and clear

## Summary

The game route implementation is clean and well-structured for a first iteration. The code correctly handles the primary success and error flows for all three endpoints. The test suite covers 13 meaningful scenarios and the mock infrastructure is clever, if brittle.

The most significant issues are:

1. **Data integrity risk (G-02):** The two-UPDATE answer flow has no transaction, creating a window for inconsistent state between the game round and user stats tables.
2. **Stale response data (G-01):** The `newBalance` returned to the client is computed from cached middleware data rather than the actual DB state after the update, which will be incorrect under concurrent requests.
3. **Crash-prone parsing (G-03):** The `JSON.parse` call on `question.options` is unguarded and will produce a 500 on corrupted data.
4. **Test verification gap (G-06):** The mock infrastructure does not capture or assert on the arguments passed to DB calls, meaning the tests verify response shape but not whether the correct data was written to the database.

The author's prep document honestly identified items 1, 2, and the mock brittleness as known risks, which is commendable. The remaining findings (G-03 through G-12) represent additional areas for improvement. I recommend addressing the three Major-severity items (G-01, G-02, G-03) and the two Major test gaps (G-06, G-07) before merge.

**Recommendation: Approved with changes** -- fix the Major items; Minor and Nit items can be tracked for follow-up.
