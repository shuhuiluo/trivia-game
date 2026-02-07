import React, { useEffect, useState } from "react";

import type { Leader, Stats as StatsData } from "../api.ts";
import { getLeaderboard, getStats } from "../api.ts";

export default function Stats() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([getStats(), getLeaderboard()])
      .then(([statsData, leaderData]) => {
        setStats(statsData);
        setLeaders(leaderData.leaders);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="loading">Loading stats...</div>;
  }

  if (error) {
    return <div className="error-msg">{error}</div>;
  }

  return (
    <div>
      {stats && (
        <>
          <h2 className="section-title">Your Stats</h2>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-value">{stats.points}</div>
              <div className="stat-label">Points</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.gamesPlayed}</div>
              <div className="stat-label">Games Played</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.correct}</div>
              <div className="stat-label">Correct</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.incorrect}</div>
              <div className="stat-label">Incorrect</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">
                {(stats.accuracy * 100).toFixed(1)}%
              </div>
              <div className="stat-label">Accuracy</div>
            </div>
          </div>
        </>
      )}

      <h2 className="section-title">Leaderboard</h2>
      {leaders.length === 0 ? (
        <p>No leaders yet.</p>
      ) : (
        <table className="leaderboard-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Player</th>
              <th>Points</th>
            </tr>
          </thead>
          <tbody>
            {leaders.map((leader, idx) => (
              <tr key={leader.username}>
                <td>{idx + 1}</td>
                <td>{leader.username}</td>
                <td>{leader.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
