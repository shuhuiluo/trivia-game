# Review Log — Unit 2: Auth Routes & Middleware

**Reviewer:** Reviewer B
**Focus:** Security, design, tests
**Files reviewed:**

| File                            | LOC |
| ------------------------------- | --- |
| `src/server/routes/auth.ts`     | 201 |
| `src/server/middleware/auth.ts` | 58  |
| `tests/auth.test.ts`            | 244 |

**Total: 503 LOC**
**Date:** 2026-02-07
**Time spent:** 1 min 57 sec (AI-assisted)
**Review iteration:** 1

## Reviewer Metrics

| Metric                 | Value |
| ---------------------- | ----- |
| Total issues found     | 13    |
| Blockers               | 0     |
| Majors                 | 4     |
| Minors                 | 9     |
| Nits                   | 0     |
| Code issues            | 4     |
| Test issues            | 6     |
| Design issues          | 3     |
| Issues per review-hour | 400   |
| Defects per 1,000 LOC  | 25.8  |
| % test-related         | 46.2% |
| % high-severity (M+B)  | 30.8% |

## Findings

| ID   | File                 | Location     | Severity | Category | Description                                                                                                                                                  | Resolution |
| ---- | -------------------- | ------------ | -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| A-01 | `routes/auth.ts`     | line 132-137 | Major    | Code     | Missing `secure: true` on session cookie in production                                                                                                       | Open       |
| A-02 | `routes/auth.ts`     | line 105-128 | Major    | Code     | Race condition between duplicate-check SELECT and INSERT allows duplicate usernames under concurrent requests                                                | Open       |
| A-03 | `routes/auth.ts`     | line 112     | Minor    | Code     | Username enumeration via 409 response on registration                                                                                                        | Open       |
| A-04 | `routes/auth.ts`     | line 14-18   | Minor    | Design   | `createSession` is a module-level function with a hardcoded 7-day expiry, duplicated as a magic number in the cookie `maxAge`                                | Open       |
| A-05 | `middleware/auth.ts` | line 8-18    | Minor    | Design   | `AuthEnv` user type is defined manually and drifts from the DB schema; no single source of truth                                                             | Open       |
| A-06 | `routes/auth.ts`     | line 145-178 | Minor    | Code     | Login does not invalidate existing sessions, allowing unbounded session accumulation per user                                                                | Open       |
| A-07 | `tests/auth.test.ts` | line 29-49   | Major    | Test     | Register success test does not verify that `Bun.password.hash` was actually called; mock DB silently accepts any values                                      | Open       |
| A-08 | `tests/auth.test.ts` | line 173-190 | Minor    | Test     | Logout test asserts cookie header contains `"session="` but does not verify the cookie value is empty or that `Max-Age=0` / `Expires` is in the past         | Open       |
| A-09 | `tests/auth.test.ts` | —            | Major    | Test     | No test for request body with extra/unexpected fields (mass-assignment), no test for missing body, no test for non-JSON Content-Type                         | Open       |
| A-10 | `tests/auth.test.ts` | —            | Minor    | Test     | No test for SQL-injection-shaped payloads in username (e.g., `"'; DROP TABLE users;--"`) to confirm Zod + parameterized queries reject or safely handle them | Open       |
| A-11 | `tests/auth.test.ts` | line 90-121  | Minor    | Test     | Login success test does not assert `json.user.id` is the expected value (only checks `username` and `points`)                                                | Open       |
| A-12 | `middleware/auth.ts` | line 21-58   | Minor    | Design   | Middleware fetches all user stat columns on every authenticated request; for routes that only need the user ID this is unnecessary overhead                  | Open       |
| A-13 | `tests/auth.test.ts` | —            | Minor    | Test     | No test covering the `createSession` failure path (e.g., DB insert for session throws), which would result in an unhandled promise rejection / 500           | Open       |

## Detailed Findings

### A-01: Session cookie missing `secure: true` for production

**File:** `src/server/routes/auth.ts` **Lines:** 132-137, 168-173 **Severity:** Major **Category:** Code

The `setCookie` calls on both register and login set `httpOnly: true` and `sameSite: "Lax"` but omit `secure: true`. Without the `Secure` attribute, the session cookie will be transmitted over plain HTTP connections, making it vulnerable to interception via network sniffing or MITM attacks. The author prep (item 5) acknowledges this, but it should still be treated as a Major issue because the application has no environment-based conditional to add it in production.

**Suggested fix:** Add `secure: process.env.NODE_ENV === "production"` or equivalent (`Bun.env`) to the cookie options, or default `secure: true` and only disable in development.

---

### A-02: TOCTOU race condition on registration duplicate check

**File:** `src/server/routes/auth.ts` **Lines:** 105-128 **Severity:** Major **Category:** Code

The registration handler performs a SELECT to check for an existing username (line 105-109), then performs an INSERT (line 117-124). Between these two queries, a concurrent request with the same username could pass the duplicate check. While the `username` column has a `UNIQUE` constraint in the DB schema (which would cause the INSERT to throw), this error is not caught -- there is no try/catch around the INSERT. This would result in an unhandled database error and a 500 response instead of the intended 409.

**Suggested fix:** Wrap the INSERT in a try/catch that detects the unique constraint violation (Postgres error code `23505`) and returns the 409 response. Alternatively, use an INSERT ... ON CONFLICT clause via Drizzle's `onConflictDoNothing()` and check the returned row count.

---

### A-03: Username enumeration via distinct registration error

**File:** `src/server/routes/auth.ts` **Line:** 112 **Severity:** Minor **Category:** Code

The 409 response with `"Username already taken"` confirms to an attacker that a given username exists in the system. Combined with the login endpoint (which correctly uses a generic `"Invalid credentials"` message), this creates an asymmetry that allows username harvesting through the registration endpoint.

**Impact:** An attacker can iterate through a list of candidate usernames and identify which ones are registered. The author prep (item 6) notes this but categorizes it as informational. Given that this is a trivia game (not a high-value target), Minor is appropriate, but it should be addressed if the application grows.

---

### A-04: Session expiry duration is a hardcoded magic number, duplicated

**File:** `src/server/routes/auth.ts` **Lines:** 16, 136, 172 **Severity:** Minor **Category:** Design

The 7-day session duration appears as `7 * 24 * 60 * 60 * 1000` (milliseconds) on line 16 for the DB `expiresAt` and as `7 * 24 * 60 * 60` (seconds) on lines 136 and 172 for the cookie `maxAge`. These are semantically the same value in different units, but they are independently written in three places. If someone changes one without the other, the cookie lifetime and DB session lifetime will diverge, causing confusing behavior where the cookie is still sent but the session is expired (or vice versa).

**Suggested fix:** Define a single constant like `const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60` and derive both the cookie `maxAge` and the DB `expiresAt` from it.

---

### A-05: `AuthEnv` user type is manually defined, not derived from schema

**File:** `src/server/middleware/auth.ts` **Lines:** 8-18 **Severity:** Minor **Category:** Design

The `AuthEnv` type manually lists `id`, `username`, `points`, `gamesPlayed`, `correctAnswers`, `incorrectAnswers`. This is a parallel definition of what the `users` table schema already defines. If a column is renamed or a new field is added to the users table, the middleware type must be updated separately. Drizzle provides `InferSelectModel<typeof users>` or similar utilities that could be used to derive this type, keeping a single source of truth.

---

### A-06: Login does not invalidate prior sessions

**File:** `src/server/routes/auth.ts` **Lines:** 145-178 **Severity:** Minor **Category:** Code

When a user logs in, a new session is created but existing sessions for the same user are not deleted or invalidated. Over time, a single user can accumulate many active sessions in the `sessions` table. This has two implications: (1) a stolen session token remains valid even after the user logs in again (no forced re-authentication), and (2) the sessions table grows without bound for active users. The author prep (item 4) acknowledges this.

**Suggested fix:** Before creating the new session, delete all existing sessions for the user: `await db.delete(sessions).where(eq(sessions.userId, user.id))`. Alternatively, implement a maximum session count.

---

### A-07: Register test does not verify password hashing actually occurs

**File:** `tests/auth.test.ts` **Lines:** 29-49 **Severity:** Major **Category:** Test

The register success test checks that the response contains the expected user data and a session cookie, but it never verifies that the password was actually hashed before being stored. Because the mock DB is a simple proxy that ignores all arguments, the test would pass even if the route handler stored the plaintext password directly. This is a critical security behavior that should be asserted.

**Suggested fix:** Spy on `Bun.password.hash` and assert it was called with the provided password. Alternatively, capture the arguments passed to the mock DB's insert chain and verify the `passwordHash` field is not equal to the plaintext password.

---

### A-08: Logout test does not verify cookie is properly invalidated

**File:** `tests/auth.test.ts` **Lines:** 173-190 **Severity:** Minor **Category:** Test

The logout test checks that the response contains a `set-cookie` header with `"session="`, but this assertion is too weak. It does not verify that the cookie value is cleared (empty string) or that `Max-Age=0` or an `Expires` date in the past is set. A buggy implementation could set `session=new-value` and still pass this test.

**Suggested fix:** Assert that the `set-cookie` header contains `Max-Age=0` or that the cookie value extracted by `getSessionCookie` is empty/falsy.

---

### A-09: No tests for malformed request bodies or unexpected fields

**File:** `tests/auth.test.ts` **Severity:** Major **Category:** Test

The test suite validates short username and short password (Zod min-length), but does not test:

1. **Missing body entirely** -- sending a POST with no body or an empty body.
2. **Missing required fields** -- e.g., `{ username: "test" }` without `password`.
3. **Extra unexpected fields** -- e.g., `{ username: "test", password: "123456", points: 999999, id: 1 }`. This is important for mass-assignment protection: confirming that extra fields like `points` or `id` are not passed through to the database insert.
4. **Non-JSON Content-Type** -- e.g., sending `text/plain`.

These are standard edge cases for any input-validated endpoint and represent a meaningful gap in the test coverage.

---

### A-10: No test for injection-style payloads in username

**File:** `tests/auth.test.ts` **Severity:** Minor **Category:** Test

While Drizzle ORM uses parameterized queries (which should prevent SQL injection) and Zod validates input types, there is no test that explicitly passes a SQL-injection-shaped string as a username (e.g., `"'; DROP TABLE users;--"`) or an XSS payload (e.g., `"<script>alert(1)</script>"`). Including such tests serves as a regression safeguard: if someone later replaces the ORM with raw SQL or changes the validation, the test would catch the vulnerability.

---

### A-11: Login success test does not assert user ID in response

**File:** `tests/auth.test.ts` **Lines:** 113-117 **Severity:** Minor **Category:** Test

The login success test asserts `json.user.username` and `json.user.points` but omits `json.user.id`. By contrast, the register test (line 43) does assert `json.user.id`. This inconsistency means a bug that returns the wrong user ID on login would go undetected. This is a minor gap but easy to close.

---

### A-12: Middleware fetches full user stats on every authenticated request

**File:** `src/server/middleware/auth.ts` **Lines:** 28-40 **Severity:** Minor **Category:** Design

The auth middleware joins sessions with users and selects six columns (`userId`, `username`, `points`, `gamesPlayed`, `correctAnswers`, `incorrectAnswers`) on every authenticated request. Routes like `/api/auth/me` only use `id`, `username`, and `points`. Game-related routes may only need `id` and `points`. Fetching all stats on every request adds unnecessary query overhead and couples the middleware to the full user profile shape.

**Suggested fix:** Have the middleware fetch only `id`, `username`, and `points` (the fields needed by most routes). Routes that need additional stats can fetch them explicitly. Alternatively, use a lazy-loading pattern where stats are fetched on demand.

---

### A-13: No test for session creation failure

**File:** `tests/auth.test.ts` **Severity:** Minor **Category:** Test

There is no test covering what happens when `createSession()` fails (e.g., the DB insert for the session throws an error). In the current code, `createSession` is called after the user is created (register) or authenticated (login), but if it throws, the error is unhandled -- there is no try/catch. The user would receive a 500 error. While this may be acceptable behavior, it should be tested to document the expected outcome and ensure the application does not leak stack traces or sensitive information in the error response.

---

## Checklist Results

### Code Review Checklist

**Correctness & Logic**

- [x] Logic matches requirements and intent
- [ ] Edge cases handled explicitly -- race condition on duplicate username (A-02); no handling of `createSession` failure
- [ ] No hidden assumptions -- assumes `secure` cookie flag is not needed (A-01)
- [x] Error paths tested or justified

**Design & Architecture**

- [x] Clear separation of concerns
- [ ] No unnecessary coupling -- middleware fetches full user stats for all routes (A-12)
- [x] Interfaces are stable and meaningful
- [x] Dependencies are injectable/mockable

**Readability & Maintainability**

- [x] Clear naming and structure
- [x] Functions are small and focused
- [x] Comments explain _why_, not _what_
- [ ] No dead or duplicate code -- session TTL is duplicated in three places across two units (A-04)

**Performance & Robustness**

- [ ] No obvious performance pitfalls -- full user stats fetched on every auth'd request (A-12)
- [x] Resource handling is correct
- [x] Thread safety (if applicable) -- N/A for single-threaded Bun, but concurrency race noted (A-02)

### Unit Test Review Checklist

**Test Coverage & Intent**

- [x] All public behaviors are tested
- [ ] Boundary and failure cases included -- missing body, extra fields, and DB-failure paths not tested (A-09, A-13)
- [x] Tests align with requirements
- [ ] Coverage gaps are justified -- several gaps identified (A-07, A-09, A-10)

**Test Quality**

- [x] Tests are deterministic
- [x] One logical assertion per test (where possible)
- [x] Tests are readable and intention-revealing
- [ ] No brittle or over-mocked tests -- the proxy mock cannot verify any SQL logic or argument values, making it impossible to test that password hashing occurs (A-07)

**Isolation & Dependencies**

- [x] External dependencies are mocked or stubbed
- [x] No hidden reliance on shared state -- `beforeEach` resets mock results
- [x] Setup/teardown is minimal and clear

## Summary

The auth implementation is structurally sound and follows good practices: it uses `Bun.password` for hashing, `crypto.randomUUID()` for session tokens, `httpOnly` cookies, and generic error messages on login failure. The OpenAPI route definitions with Zod schemas provide solid input validation.

The most significant issues are:

1. **Security (A-01, A-02):** The missing `secure` cookie flag is a well-known gap that should be addressed with an environment-aware setting. The TOCTOU race on registration, while partially mitigated by the DB unique constraint, will produce unhandled 500 errors under concurrent load.

2. **Test gaps (A-07, A-09):** The test suite covers the happy paths and basic validation errors well, but misses critical security-relevant assertions. The mock infrastructure, while clever, is too permissive -- it cannot verify what values are passed to the database, so security-critical behavior like password hashing is untestable without additional spying.

3. **Design (A-04, A-05, A-12):** There are several maintainability concerns around duplicated constants, manual type definitions, and over-fetching in the middleware. These are not urgent but will become friction points as the codebase grows.

Overall assessment: **Approved with changes.** The two Major code issues (A-01, A-02) and the Major test gap (A-07, A-09) should be addressed before merge. The remaining Minor items can be tracked as follow-up work.
