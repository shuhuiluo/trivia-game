# Trivia Game

A client-server trivia game built with Bun, Hono, React, and PostgreSQL + Drizzle ORM.

## Architecture

- **Backend:** Hono HTTP framework on Bun, PostgreSQL via Drizzle ORM
- **Frontend:** React 19 SPA served via Bun's HTML imports (no Vite)
- **Auth:** Cookie-based sessions stored in DB, passwords hashed with `Bun.password`

## Project Structure

```
src/
  server/
    index.ts              # Hono app + Bun.serve, serves API + static HTML
    routes/
      auth.ts             # /api/auth/* (register, login, logout, me)
      game.ts             # /api/game/* + /api/categories
      stats.ts            # /api/stats, /api/leaderboard
    db/
      index.ts            # postgres client + drizzle instance
      schema.ts           # all table definitions
      seed.ts             # seed categories + questions
    middleware/
      auth.ts             # session cookie validation middleware
  client/
    index.html            # entry HTML (served by Bun.serve at "/")
    app.tsx               # React root
    components/
      Login.tsx           # login/register form
      Game.tsx            # category select → wager → question → result flow
      Stats.tsx           # stats + leaderboard display
      Layout.tsx          # nav bar with points, logout
    api.ts                # fetch wrappers for all endpoints
    styles.css            # CSS
drizzle.config.ts
```

## API Endpoints

### Auth

| Method | Path                 | Body                     | Response                             |
| ------ | -------------------- | ------------------------ | ------------------------------------ |
| POST   | `/api/auth/register` | `{ username, password }` | `{ user: { id, username, points } }` |
| POST   | `/api/auth/login`    | `{ username, password }` | `{ user: { id, username, points } }` |
| POST   | `/api/auth/logout`   | —                        | `{ ok: true }`                       |
| GET    | `/api/auth/me`       | —                        | `{ user }` or 401                    |

### Game

| Method | Path               | Body                       | Response                                             |
| ------ | ------------------ | -------------------------- | ---------------------------------------------------- |
| GET    | `/api/categories`  | —                          | `{ categories: [{ id, name, questionCount }] }`      |
| POST   | `/api/game/start`  | `{ categoryId, wager }`    | `{ round: { id, question, options } }`               |
| POST   | `/api/game/answer` | `{ roundId, answerIndex }` | `{ correct, correctIndex, pointsDelta, newBalance }` |

### Stats

| Method | Path               | Response                                                |
| ------ | ------------------ | ------------------------------------------------------- |
| GET    | `/api/stats`       | `{ points, gamesPlayed, correct, incorrect, accuracy }` |
| GET    | `/api/leaderboard` | `{ leaders: [{ username, points }] }`                   |

## Database Tables

- **users** — id, username (unique), passwordHash, points (default 100), gamesPlayed, correctAnswers, incorrectAnswers, createdAt, updatedAt
- **sessions** — id (token), userId (FK→users), expiresAt
- **categories** — id, name (unique)
- **questions** — id, categoryId (FK→categories), questionText, options (JSON string array), correctIndex, createdAt
- **gameRounds** — id, userId (FK→users), questionId (FK→questions), wager, answerIndex (nullable), correct (nullable), pointsDelta (nullable), createdAt

## Scripts

```sh
bun run dev          # start server with hot reload
bun run start        # start server
bun run build        # typecheck (tsc --noEmit)
bun run db:up        # start postgres docker container
bun run db:down      # stop postgres docker container
bun run db:push      # push schema to database
bun run db:generate  # generate drizzle migrations
bun run db:migrate   # run drizzle migrations
bun run seed         # seed categories + questions
bun test             # run tests
bun run lint         # eslint
bun run format       # prettier
```

## Getting Started

```sh
bun install
bun run db:up
bun run db:push
bun run seed
bun run dev
# open http://localhost:3000
```
