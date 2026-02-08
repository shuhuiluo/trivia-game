import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test";

import authApp from "../src/server/routes/auth.ts";
import {
  DB_MOCK_FACTORY,
  getSessionCookie,
  jsonRequest,
  MOCK_USER,
  MockError,
  setMockResults,
} from "./helpers.ts";

// Must be in the test file itself — hoisting only applies to the calling file
mock.module("../src/server/db/index.ts", () => DB_MOCK_FACTORY());

// Pre-compute a real password hash so Bun.password.verify works in login tests
let testPasswordHash: string;

beforeAll(async () => {
  testPasswordHash = await Bun.password.hash("password123");
});

// ---------------------------------------------------------------------------
// POST /api/auth/register
// ---------------------------------------------------------------------------

describe("POST /api/auth/register", () => {
  beforeEach(() => setMockResults([]));

  test("creates user with 100 starting points and sets session cookie", async () => {
    const hashSpy = spyOn(Bun.password, "hash");

    setMockResults([
      [{ id: 1, username: "newuser", points: 100 }], // insert: create user
      undefined, // insert: create session
    ]);

    const res = await authApp.request(
      "/api/auth/register",
      jsonRequest("POST", { username: "newuser", password: "password123" })
    );
    expect(res.status).toBe(200);

    // A-07: verify password hashing was called
    expect(hashSpy).toHaveBeenCalledWith("password123");
    hashSpy.mockRestore();

    const json = await res.json();
    expect(json.user.id).toBe(1);
    expect(json.user.username).toBe("newuser");
    expect(json.user.points).toBe(100);

    const token = getSessionCookie(res);
    expect(token).toBeTruthy();
  });

  test("rejects duplicate username with 409", async () => {
    // A-02: INSERT throws unique constraint violation (Postgres code 23505)
    setMockResults([new MockError({ code: "23505" })]);

    const res = await authApp.request(
      "/api/auth/register",
      jsonRequest("POST", { username: "taken", password: "password123" })
    );
    expect(res.status).toBe(409);

    const json = await res.json();
    expect(json.error).toContain("already taken");
  });

  test("rejects username shorter than 3 characters", async () => {
    const res = await authApp.request(
      "/api/auth/register",
      jsonRequest("POST", { username: "ab", password: "password123" })
    );
    expect(res.status).toBe(400);
  });

  test("rejects password shorter than 6 characters", async () => {
    const res = await authApp.request(
      "/api/auth/register",
      jsonRequest("POST", { username: "validuser", password: "short" })
    );
    expect(res.status).toBe(400);
  });

  test("rejects request with no body", async () => {
    const res = await authApp.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
  });

  test("rejects request with missing password field", async () => {
    const res = await authApp.request(
      "/api/auth/register",
      jsonRequest("POST", { username: "testuser" })
    );
    expect(res.status).toBe(400);
  });

  test("ignores extra fields and succeeds", async () => {
    setMockResults([
      [{ id: 2, username: "safe", points: 100 }], // insert: create user
      undefined, // insert: create session
    ]);

    const res = await authApp.request(
      "/api/auth/register",
      jsonRequest("POST", {
        username: "safe",
        password: "password123",
        points: 999999,
        id: 1,
        isAdmin: true,
      })
    );
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.user.points).toBe(100); // not 999999
  });

  test("does not succeed with non-JSON content type", async () => {
    const res = await authApp.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "username=test&password=password123",
    });
    expect(res.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------

describe("POST /api/auth/login", () => {
  beforeEach(() => setMockResults([]));

  test("logs in with correct credentials and sets session cookie", async () => {
    setMockResults([
      // select: find user (includes passwordHash for verify)
      [
        {
          id: 1,
          username: "testuser",
          passwordHash: testPasswordHash,
          points: 100,
          gamesPlayed: 5,
          correctAnswers: 3,
          incorrectAnswers: 2,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      undefined, // insert: create session
    ]);

    const res = await authApp.request(
      "/api/auth/login",
      jsonRequest("POST", { username: "testuser", password: "password123" })
    );
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.user.username).toBe("testuser");
    expect(json.user.points).toBe(100);

    const token = getSessionCookie(res);
    expect(token).toBeTruthy();
  });

  test("rejects wrong password with 401", async () => {
    setMockResults([
      [
        {
          id: 1,
          username: "testuser",
          passwordHash: testPasswordHash,
          points: 100,
          gamesPlayed: 0,
          correctAnswers: 0,
          incorrectAnswers: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    ]);

    const res = await authApp.request(
      "/api/auth/login",
      jsonRequest("POST", { username: "testuser", password: "wrongpassword" })
    );
    expect(res.status).toBe(401);

    const json = await res.json();
    expect(json.error).toContain("Invalid credentials");
  });

  test("rejects nonexistent user with 401", async () => {
    setMockResults([
      [], // select: no user found
    ]);

    const res = await authApp.request(
      "/api/auth/login",
      jsonRequest("POST", { username: "ghost", password: "password123" })
    );
    expect(res.status).toBe(401);

    const json = await res.json();
    expect(json.error).toContain("Invalid credentials");
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/logout
// ---------------------------------------------------------------------------

describe("POST /api/auth/logout", () => {
  beforeEach(() => setMockResults([]));

  test("clears session from DB and removes cookie", async () => {
    setMockResults([
      undefined, // delete: remove session from DB
    ]);

    const res = await authApp.request("/api/auth/logout", {
      method: "POST",
      headers: { Cookie: "session=some-token" },
    });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.ok).toBe(true);

    // Cookie should be cleared (set to empty or with expired date)
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toContain("session=");
  });

  test("succeeds even without a session cookie", async () => {
    const res = await authApp.request("/api/auth/logout", {
      method: "POST",
    });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GET /api/auth/me
// ---------------------------------------------------------------------------

describe("GET /api/auth/me", () => {
  beforeEach(() => setMockResults([]));

  test("returns current user when session is valid", async () => {
    setMockResults([
      [MOCK_USER], // middleware: session lookup
    ]);

    const res = await authApp.request("/api/auth/me", {
      headers: { Cookie: "session=valid-token" },
    });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.user.id).toBe(1);
    expect(json.user.username).toBe("testuser");
    expect(json.user.points).toBe(100);
  });

  test("returns 401 when no session cookie is present", async () => {
    const res = await authApp.request("/api/auth/me");
    expect(res.status).toBe(401);

    const json = await res.json();
    expect(json.error).toContain("Unauthorized");
  });

  test("returns 401 when session is invalid or expired", async () => {
    setMockResults([
      [], // middleware: session lookup returns nothing (expired/invalid)
    ]);

    const res = await authApp.request("/api/auth/me", {
      headers: { Cookie: "session=expired-token" },
    });
    expect(res.status).toBe(401);
  });
});
