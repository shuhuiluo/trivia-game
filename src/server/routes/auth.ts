import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

import {
  credentialsSchema,
  errorSchema,
  userResponseSchema,
} from "../../shared/schemas.ts";
import { db } from "../db";
import { sessions, users } from "../db/schema.ts";
import { authMiddleware, type AuthEnv } from "../middleware/auth.ts";

async function createSession(userId: number): Promise<string> {
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({ id: token, userId, expiresAt });
  return token;
}

// --- Register ---

const registerRoute = createRoute({
  method: "post",
  path: "/api/auth/register",
  request: {
    body: {
      content: { "application/json": { schema: credentialsSchema } },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: userResponseSchema } },
      description: "User registered successfully",
    },
    409: {
      content: { "application/json": { schema: errorSchema } },
      description: "Username already taken",
    },
  },
});

// --- Login ---

const loginRoute = createRoute({
  method: "post",
  path: "/api/auth/login",
  request: {
    body: {
      content: { "application/json": { schema: credentialsSchema } },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: userResponseSchema } },
      description: "Logged in successfully",
    },
    401: {
      content: { "application/json": { schema: errorSchema } },
      description: "Invalid credentials",
    },
  },
});

// --- Logout ---

const logoutRoute = createRoute({
  method: "post",
  path: "/api/auth/logout",
  responses: {
    200: {
      content: {
        "application/json": { schema: z.object({ ok: z.boolean() }) },
      },
      description: "Logged out successfully",
    },
  },
});

// --- Me ---

const meRoute = createRoute({
  method: "get",
  path: "/api/auth/me",
  middleware: [authMiddleware] as const,
  responses: {
    200: {
      content: { "application/json": { schema: userResponseSchema } },
      description: "Current user",
    },
    401: {
      content: { "application/json": { schema: errorSchema } },
      description: "Not authenticated",
    },
  },
});

// --- App ---

const app = new OpenAPIHono<AuthEnv>();

app.openapi(registerRoute, async c => {
  const { username, password } = c.req.valid("json");

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  if (existing.length > 0) {
    return c.json({ error: "Username already taken" }, 409);
  }

  const passwordHash = await Bun.password.hash(password);

  const [user] = await db
    .insert(users)
    .values({ username, passwordHash })
    .returning({
      id: users.id,
      username: users.username,
      points: users.points,
    });

  if (!user) {
    return c.json({ error: "Failed to create user" }, 409);
  }

  const token = await createSession(user.id);

  setCookie(c, "session", token, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });

  return c.json(
    { user: { id: user.id, username: user.username, points: user.points } },
    200
  );
});

app.openapi(loginRoute, async c => {
  const { username, password } = c.req.valid("json");

  const result = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  const user = result[0];

  if (!user) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  const valid = await Bun.password.verify(password, user.passwordHash);

  if (!valid) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  const token = await createSession(user.id);

  setCookie(c, "session", token, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });

  return c.json(
    { user: { id: user.id, username: user.username, points: user.points } },
    200
  );
});

app.openapi(logoutRoute, async c => {
  const token = getCookie(c, "session");

  if (token) {
    await db.delete(sessions).where(eq(sessions.id, token));
  }

  deleteCookie(c, "session", { path: "/" });

  return c.json({ ok: true as const }, 200);
});

app.openapi(meRoute, async c => {
  const user = c.var.user;
  return c.json(
    { user: { id: user.id, username: user.username, points: user.points } },
    200
  );
});

export default app;
