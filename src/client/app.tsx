import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import type { User } from "./api.ts";
import { getMe } from "./api.ts";
import Game from "./components/Game.tsx";
import Layout from "./components/Layout.tsx";
import Login from "./components/Login.tsx";
import Stats from "./components/Stats.tsx";

import "./styles.css";

type Page = "game" | "stats";

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [page, setPage] = useState<Page>("game");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMe()
      .then(data => setUser(data.user))
      .catch(() => {
        /* not logged in */
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (!user) {
    return <Login setUser={setUser} />;
  }

  return (
    <Layout user={user} setUser={setUser} page={page} setPage={setPage}>
      {page === "game" ? <Game user={user} setUser={setUser} /> : <Stats />}
    </Layout>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
