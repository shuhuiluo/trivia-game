/** Shared mock infrastructure and utilities for all test files.
 *
 *  IMPORTANT: Each test file must call `mock.module` itself — hoisting only
 *  works within the file that contains the call.  Use `DB_MOCK_FACTORY` as
 *  the factory argument so the implementation lives in one place.
 */

// ---------------------------------------------------------------------------
// Mock DB factory — pass this to mock.module() in every test file
// ---------------------------------------------------------------------------

/** Wrap a value with MockError to make the mock chain reject instead of resolve. */
export class MockError {
  constructor(public error: any) {}
}

/** Self-contained factory that returns a Proxy-based fake Drizzle `db`.
 *  Every chained query (select/insert/update/delete) resolves to the next
 *  entry in the `globalThis.__db.results` array. If an entry is a MockError,
 *  the chain rejects with the wrapped error instead. */
export function DB_MOCK_FACTORY() {
  function createChain() {
    const g = globalThis as any;
    if (!g.__db) g.__db = { results: [], idx: 0 };
    const idx = g.__db.idx++;
    const chain: any = new Proxy(
      {},
      {
        get(_, prop) {
          if (typeof prop === "symbol") return undefined;
          if (prop === "then") {
            const val = g.__db.results[idx];
            if (val instanceof MockError) {
              return (_resolve: Function, reject: Function) =>
                reject(val.error);
            }
            return (resolve: Function) => resolve(val);
          }
          return (..._args: any[]) => chain;
        },
      }
    );
    return chain;
  }

  const dbMethods = {
    select: (..._: any[]) => createChain(),
    insert: (..._: any[]) => createChain(),
    update: (..._: any[]) => createChain(),
    delete: (..._: any[]) => createChain(),
    transaction: async (fn: Function) => fn(dbMethods),
  };

  return { db: dbMethods };
}

// ---------------------------------------------------------------------------
// Helpers used by individual test files
// ---------------------------------------------------------------------------

/** Replace the mock result queue. Call in `beforeEach` or at the top of each
 *  test with the exact sequence of values the DB calls will resolve to. */
export function setMockResults(results: any[]) {
  (globalThis as any).__db = { results, idx: 0 };
}

/** Build a JSON POST/PUT RequestInit, optionally with a session cookie. */
export function jsonRequest(
  method: string,
  body: object,
  cookie?: string
): RequestInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (cookie) headers["Cookie"] = cookie;
  return { method, headers, body: JSON.stringify(body) };
}

/** Extract the session token from a Set-Cookie response header. */
export function getSessionCookie(res: Response): string | null {
  const header = res.headers.get("set-cookie");
  return header?.match(/session=([^;]+)/)?.[1] ?? null;
}

// Standard mock objects matching the DB/app shapes --------------------------

export const MOCK_USER = {
  userId: 1,
  username: "testuser",
  points: 100,
  gamesPlayed: 0,
  correctAnswers: 0,
  incorrectAnswers: 0,
};

export const MOCK_QUESTION = {
  id: 1,
  categoryId: 1,
  questionText: "What is 2+2?",
  options: JSON.stringify(["1", "2", "3", "4"]),
  correctIndex: 3,
  createdAt: new Date(),
};

export const MOCK_ROUND = {
  id: 1,
  userId: 1,
  questionId: 1,
  wager: 10,
  answerIndex: null,
  correct: null,
  pointsDelta: null,
  createdAt: new Date(),
};
