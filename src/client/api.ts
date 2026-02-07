import type {
  AnswerResult,
  Category,
  Leader,
  Round,
  Stats,
  User,
} from "../shared/schemas.ts";

export type { AnswerResult, Category, Leader, Round, Stats, User };

// ---- Helpers ----

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "same-origin",
    ...init,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

function postJson<T>(url: string, data: unknown): Promise<T> {
  return request<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

// ---- Auth ----

export function register(username: string, password: string) {
  return postJson<{ user: User }>("/api/auth/register", {
    username,
    password,
  });
}

export function login(username: string, password: string) {
  return postJson<{ user: User }>("/api/auth/login", { username, password });
}

export function logout() {
  return postJson<{ ok: boolean }>("/api/auth/logout", {});
}

export function getMe() {
  return request<{ user: User }>("/api/auth/me");
}

// ---- Game ----

export function getCategories() {
  return request<{ categories: Category[] }>("/api/categories");
}

export function startGame(categoryId: number, wager: number) {
  return postJson<{ round: Round }>("/api/game/start", {
    categoryId,
    wager,
  });
}

export function submitAnswer(roundId: number, answerIndex: number) {
  return postJson<AnswerResult>("/api/game/answer", { roundId, answerIndex });
}

// ---- Stats ----

export function getStats() {
  return request<Stats>("/api/stats");
}

export function getLeaderboard() {
  return request<{ leaders: Leader[] }>("/api/leaderboard");
}
