---
description: Use Bun instead of Node.js, npm, pnpm, or vite.
globs: "*.ts, *.tsx, *.html, *.css, *.js, *.jsx, package.json"
alwaysApply: false
---

## Runtime

Use Bun for everything. No Node.js, npm, Vite, or Express.

- `bun <file>` to run, `bun test` to test, `bun install` to install
- `bun --hot src/server/index.ts` for dev server
- Bun auto-loads `.env` — no dotenv

## Stack

- **@hono/zod-openapi** for HTTP routing with OpenAPI schema generation
- **Zod** (v4) for all request/response validation schemas
- **Drizzle ORM** + `postgres` driver for PostgreSQL
- **React 19** for the frontend, served via Bun HTML imports
- **Bun.password** for password hashing (not bcrypt)
- Cookie-based sessions stored in the `sessions` table

## OpenAPI Route Pattern

All API routes use `@hono/zod-openapi`. Define routes with `createRoute()` and implement with `app.openapi()`:

```ts
import { createRoute, z } from "@hono/zod-openapi";

const myRoute = createRoute({
  method: "get",
  path: "/api/example",
  responses: {
    200: {
      content: {
        "application/json": { schema: z.object({ ok: z.boolean() }) },
      },
      description: "Success",
    },
  },
});

app.openapi(myRoute, async c => {
  return c.json({ ok: true });
});
```

For routes with request bodies:

```ts
const postRoute = createRoute({
  method: "post",
  path: "/api/example",
  request: {
    body: {
      content: { "application/json": { schema: z.object({ name: z.string() }) } },
    },
  },
  responses: { ... },
});

app.openapi(postRoute, async (c) => {
  const { name } = c.req.valid("json");
  return c.json({ name });
});
```

The OpenAPI spec is served at `/doc` via `app.doc()`. Zod schemas are shared as the single source of truth for both validation and API documentation.

## Key Conventions

- Server code lives in `src/server/`, client code in `src/client/`
- Database schema is in `src/server/db/schema.ts` using Drizzle `pgTable`
- All API routes return JSON, mounted under `/api/*`
- Auth middleware reads a `session` cookie, looks up the session in DB, attaches user to Hono context
- The Hono app is served via `Bun.serve()` with a `fetch` handler — the HTML entry point (`src/client/index.html`) is served at `"/"` as a Bun HTML import
- Frontend uses plain React state (no router library) — `app.tsx` manages auth state and switches between Login, Game, and Stats views

## Bun APIs

- `Bun.serve()` with `fetch` handler for Hono integration
- `Bun.password.hash()` / `Bun.password.verify()` for auth
- HTML imports: `import html from "./index.html"` returns a `Response` handler
- `Bun.file()` over `node:fs`

## Frontend

HTML files import `.tsx` directly — Bun bundles automatically:

```html
<script type="module" src="./app.tsx"></script>
<link rel="stylesheet" href="./styles.css" />
```

## Testing

```ts
import { expect, test } from "bun:test";
```

## Formatting & Linting

- `bun run format` — Prettier
- `bun run lint` — ESLint (typescript-eslint + prettier plugin)
- Pre-commit hook (husky) runs `format:check` + `lint` automatically
