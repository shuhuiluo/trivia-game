# Review Unit 2 — Author Preparation: Auth Routes & Middleware

## Unit Description

This review unit covers user authentication: registration, login, logout,
session management via cookie-based tokens, and the auth middleware that
protects authenticated endpoints.

### Files Under Review

| File                            | LOC | Role                                              |
| ------------------------------- | --- | ------------------------------------------------- |
| `src/server/routes/auth.ts`     | 201 | Auth route handlers (register, login, logout, me) |
| `src/server/middleware/auth.ts` | 58  | Session validation middleware                     |
| `tests/auth.test.ts`            | 244 | Unit tests for auth routes and middleware         |

**Total: 503 LOC**

### Key Behaviors

1. **POST /api/auth/register** — Checks for duplicate username, hashes password
   with `Bun.password.hash()`, inserts user with 100 starting points, creates a
   session (random UUID, 7-day expiry), sets httpOnly cookie.
2. **POST /api/auth/login** — Looks up user by username, verifies password with
   `Bun.password.verify()`, creates session, sets cookie.
3. **POST /api/auth/logout** — Reads session cookie, deletes session from DB,
   clears cookie. Succeeds even without a cookie.
4. **GET /api/auth/me** — Protected by auth middleware. Returns current user's
   id, username, and points.
5. **Auth middleware** — Reads `session` cookie, joins sessions + users table,
   checks expiry (`expiresAt > now`), attaches user data to Hono context.
   Returns 401 if cookie missing, session not found, or expired.

## Test Strategy Summary

### Approach

Same mock infrastructure as Unit 1: `mock.module` replaces the Drizzle `db`
with a Proxy-based fake. For login tests, a real password hash is pre-computed
in `beforeAll` so that `Bun.password.verify()` works against known credentials.

### What Is Tested (12 tests)

| Area     | Tests                                                                                                    |
| -------- | -------------------------------------------------------------------------------------------------------- |
| Register | Success (user created, cookie set); duplicate username (409); short username (400); short password (400) |
| Login    | Success (cookie set); wrong password (401); nonexistent user (401)                                       |
| Logout   | Clears session + cookie; succeeds without cookie                                                         |
| Me       | Valid session returns user; no cookie → 401; invalid/expired session → 401                               |

### Coverage Goals

- All four route handlers on success and error paths
- Zod validation for credentials (username min 3, password min 6)
- Middleware behavior: missing cookie, invalid token, expired session
- Cookie lifecycle: set on register/login, cleared on logout

## Known Limitations and Risks

1. **Password hashing in tests** — Login tests use a real `Bun.password.hash()`
   output. This is correct but adds ~10ms latency per test run. If the hashing
   algorithm changes, the pre-computed hash becomes invalid.
2. **Session cleanup** — There is no mechanism to clean up expired sessions.
   The `sessions` table will grow indefinitely. Not tested because there is no
   cleanup code to test.
3. **No rate limiting** — Registration and login endpoints have no brute-force
   protection. An attacker could enumerate usernames or attempt password
   spraying. Outside test scope but a security risk.
4. **Session fixation** — On login, a new session is created but any existing
   sessions for the user are not invalidated. A user could accumulate many
   active sessions.
5. **Cookie security** — `sameSite: "Lax"` and `httpOnly: true` are set, but
   `secure: true` is not. In production over HTTPS this should be added.
   Tests do not verify cookie attributes beyond presence.
6. **Error disclosure** — The 409 response for duplicate usernames reveals that
   the username exists, which could aid enumeration. The 401 responses for login
   correctly use a generic "Invalid credentials" message.
7. **Mock limitations** — Same as Unit 1: sequential mock cannot verify SQL
   correctness or session expiry logic (the `gt(expiresAt, new Date())` clause
   is in SQL, not in JS).
