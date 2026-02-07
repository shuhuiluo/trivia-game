import React, { useState } from "react";

import type { User } from "../api.ts";
import { login, register } from "../api.ts";

interface LoginProps {
  setUser: (user: User) => void;
}

export default function Login({ setUser }: LoginProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    const action = mode === "login" ? login : register;

    action(username, password)
      .then(data => {
        setUser(data.user);
      })
      .catch((err: Error) => {
        setError(err.message);
      })
      .finally(() => {
        setSubmitting(false);
      });
  };

  return (
    <div className="auth-container">
      <h2>{mode === "login" ? "Sign In" : "Create Account"}</h2>

      {error && <div className="error-msg">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="username">Username</label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            required
            autoComplete="username"
          />
        </div>

        <div className="form-group">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
          />
        </div>

        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting
            ? "Please wait..."
            : mode === "login"
              ? "Sign In"
              : "Create Account"}
        </button>
      </form>

      <div className="form-toggle">
        {mode === "login" ? (
          <>
            Don&apos;t have an account?{" "}
            <button type="button" onClick={() => setMode("register")}>
              Register
            </button>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <button type="button" onClick={() => setMode("login")}>
              Sign In
            </button>
          </>
        )}
      </div>
    </div>
  );
}
