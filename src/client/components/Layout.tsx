import React from "react";

import type { User } from "../api.ts";
import { logout } from "../api.ts";

type Page = "game" | "stats";

interface LayoutProps {
  user: User;
  setUser: (user: User | null) => void;
  page: Page;
  setPage: (page: Page) => void;
  children: React.ReactNode;
}

export default function Layout({
  user,
  setUser,
  page,
  setPage,
  children,
}: LayoutProps) {
  const handleLogout = () => {
    logout()
      .then(() => {
        setUser(null);
      })
      .catch(() => {
        // force clear client state even on error
        setUser(null);
      });
  };

  return (
    <>
      <nav className="nav">
        <div className="nav-left">
          <span className="nav-user">{user.username}</span>
          <span className="nav-points">{user.points} pts</span>
        </div>
        <div className="nav-links">
          <button
            type="button"
            className={page === "game" ? "active" : ""}
            onClick={() => setPage("game")}
          >
            Play
          </button>
          <button
            type="button"
            className={page === "stats" ? "active" : ""}
            onClick={() => setPage("stats")}
          >
            Stats
          </button>
          <button type="button" className="nav-logout" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </nav>
      {children}
    </>
  );
}
