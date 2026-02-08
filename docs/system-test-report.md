# System Test Report

**Project:** Trivia Game
**Date:** 2026-02-07
**Test file:** `tests/api.test.ts` (353 LOC, 9 tests)

## 1. Testing Strategy

### Approach

System tests exercise full request-response cycles through the combined Hono application. The app is assembled by mounting all route modules (`auth`, `game`, `stats`) onto a single `OpenAPIHono` instance — mirroring `src/server/index.ts` without `Bun.serve()` or HTML imports. Requests are sent via Hono's `app.request()` method, which invokes the full middleware and handler chain in-process without a running HTTP server.

### Communication Protocol

The client and server communicate over **REST/JSON over HTTP**:

- **Request format:** JSON body with `Content-Type: application/json`
- **Authentication:** Cookie-based sessions. The server sets an `httpOnly` cookie named `session` containing a UUID token. Clients include this cookie on subsequent requests.
- **Response format:** All endpoints return JSON. Success responses include domain data; error responses include an `{ error: string }` object.
- **Validation:** Request bodies are validated against Zod schemas via `@hono/zod-openapi`. Invalid requests receive a 400 response with validation error details.

### What Is Tested

| Test Suite         | Tests | Description                                                |
| ------------------ | ----- | ---------------------------------------------------------- |
| Full gameplay flow | 2     | Multi-step flows covering the complete game lifecycle      |
| Session handling   | 3     | Authentication flows: login after register, unauth, logout |
| Leaderboard        | 2     | Public endpoint: populated and empty leaderboard           |

### Database Mocking

The database is replaced with a Proxy-based mock (`DB_MOCK_FACTORY` from `tests/helpers.ts`) via Bun's `mock.module`. Each test configures a sequence of mock results that the chained Drizzle queries consume in order. This isolates the tests from PostgreSQL and makes them deterministic and fast.

For login tests, a real `Bun.password.hash()` output is pre-computed in `beforeAll` so that `Bun.password.verify()` works against known credentials.

## 2. Test Results

```
bun test v1.3.8

 39 pass
 0 fail
 120 expect() calls
Ran 39 tests across 3 files. [746ms]
```

All 9 system tests pass (within the 39 total).

### Detailed Results

| #   | Test                                                             | Status | Assertions |
| --- | ---------------------------------------------------------------- | ------ | ---------- |
| 1   | Register -> start game -> correct answer -> stats -> leaderboard | Pass   | 18         |
| 2   | Register -> start game -> wrong answer -> stats reflect loss     | Pass   | 11         |
| 3   | Login after registration uses same user data                     | Pass   | 5          |
| 4   | Unauthenticated requests to protected endpoints return 401       | Pass   | 3          |
| 5   | Logout then access protected endpoint returns 401                | Pass   | 2          |
| 6   | Returns top users sorted by points                               | Pass   | 4          |
| 7   | Returns empty leaderboard when no users exist                    | Pass   | 2          |

Tests 1 and 2 are the primary system tests, each executing 5-6 sequential API calls that verify the complete game lifecycle.

## 3. Coverage Analysis

### Endpoints Covered

| Endpoint             | Method | Covered By    |
| -------------------- | ------ | ------------- |
| `/api/auth/register` | POST   | Tests 1, 2, 3 |
| `/api/auth/login`    | POST   | Test 3        |
| `/api/auth/logout`   | POST   | Test 5        |
| `/api/auth/me`       | GET    | Test 5        |
| `/api/categories`    | GET    | Test 1        |
| `/api/game/start`    | POST   | Tests 1, 2, 4 |
| `/api/game/answer`   | POST   | Tests 1, 2, 4 |
| `/api/stats`         | GET    | Tests 1, 2, 4 |
| `/api/leaderboard`   | GET    | Tests 1, 6, 7 |

All 9 API endpoints are exercised by at least one system test.

### Cross-Cutting Concerns

- **Session cookie lifecycle:** Verified across register (set), login (set), logout (cleared), and subsequent access (rejected).
- **Auth middleware integration:** Tested on all protected endpoints — game/start, game/answer, stats, auth/me.
- **Points flow:** Correct answer adds wager to balance; incorrect answer deducts wager. Stats reflect updated values.
- **Route composition:** Auth, game, and stats routes mounted on a single app work together without conflicts.

## 4. Known Issues and Limitations

1. **No real database:** Tests use a sequential mock, so they cannot verify actual SQL correctness. Bugs in query construction (joins, where clauses, ordering) would not be caught.
2. **No concurrent request testing:** Race conditions identified in the code review (stale balance, negative points) cannot be tested with the current mock approach.
3. **Mock ordering is brittle:** Tests depend on the exact sequence of DB calls. Refactoring that reorders queries would break tests even if behavior is unchanged.
4. **No WebSocket/SSE testing:** The app currently uses only REST, but if real-time features are added, the test infrastructure would need extension.
5. **No error propagation testing:** System tests do not verify how errors in one step (e.g., failed answer submission) affect subsequent steps in the flow.
