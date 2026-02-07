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

- **Hono** for HTTP routing (not Express, not raw Bun.serve routes)
- **Drizzle ORM** + `postgres` driver for PostgreSQL
- **React 19** for the frontend, served via Bun HTML imports
- **Bun.password** for password hashing (not bcrypt)
- Cookie-based sessions stored in the `sessions` table

## Key Conventions

- Server code lives in `src/server/`, client code in `src/client/`
- Database schema is in `src/server/db/schema.ts` using Drizzle `pgTable`
- All API routes return JSON, mounted under `/api/*` on the Hono app
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
