import React, { useEffect, useState } from "react";

import type { AnswerResult, Category, Round, User } from "../api.ts";
import { getCategories, startGame, submitAnswer } from "../api.ts";

type Stage = "categories" | "wager" | "question" | "result";

interface GameProps {
  user: User;
  setUser: (user: User) => void;
}

export default function Game({ user, setUser }: GameProps) {
  const [stage, setStage] = useState<Stage>("categories");
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(
    null
  );
  const [wager, setWager] = useState("");
  const [round, setRound] = useState<Round | null>(null);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    getCategories()
      .then(data => setCategories(data.categories))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleCategorySelect = (category: Category) => {
    setSelectedCategory(category);
    setWager("");
    setError("");
    setStage("wager");
  };

  const handleWagerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCategory) return;

    const wagerNum = parseInt(wager, 10);
    if (isNaN(wagerNum) || wagerNum < 1 || wagerNum > user.points) {
      setError(`Wager must be between 1 and ${user.points}`);
      return;
    }

    setError("");
    setLoading(true);
    startGame(selectedCategory.id, wagerNum)
      .then(data => {
        setRound(data.round);
        setStage("question");
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  };

  const handleAnswer = (answerIndex: number) => {
    if (!round) return;

    setLoading(true);
    setError("");
    submitAnswer(round.id, answerIndex)
      .then(data => {
        setResult(data);
        setUser({ ...user, points: data.newBalance });
        setStage("result");
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  };

  const handlePlayAgain = () => {
    setStage("categories");
    setSelectedCategory(null);
    setRound(null);
    setResult(null);
    setWager("");
    setError("");
  };

  if (loading && stage === "categories" && categories.length === 0) {
    return <div className="loading">Loading categories...</div>;
  }

  return (
    <div>
      {error && <div className="error-msg">{error}</div>}

      {stage === "categories" && (
        <>
          <h2 className="section-title">Choose a Category</h2>
          <div className="category-grid">
            {categories.map(cat => (
              <button
                key={cat.id}
                type="button"
                className="category-card"
                onClick={() => handleCategorySelect(cat)}
              >
                <div className="name">{cat.name}</div>
                <div className="count">
                  {cat.questionCount} question
                  {cat.questionCount !== 1 ? "s" : ""}
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {stage === "wager" && selectedCategory && (
        <>
          <button
            type="button"
            className="back-btn"
            onClick={() => setStage("categories")}
          >
            &larr; Back to categories
          </button>
          <div className="wager-section">
            <h2 className="section-title">{selectedCategory.name}</h2>
            <p>
              You have <strong>{user.points}</strong> points. How much do you
              want to wager?
            </p>
            <form onSubmit={handleWagerSubmit}>
              <div className="wager-input">
                <input
                  type="number"
                  min={1}
                  max={user.points}
                  value={wager}
                  onChange={e => setWager(e.target.value)}
                  placeholder={`1 - ${user.points}`}
                  required
                />
                <button type="submit" disabled={loading}>
                  {loading ? "Starting..." : "Start"}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {stage === "question" && round && (
        <div className="question-section">
          <p className="question-text">{round.question}</p>
          <div className="options-list">
            {round.options.map((option, idx) => (
              <button
                key={idx}
                type="button"
                className="option-btn"
                onClick={() => handleAnswer(idx)}
                disabled={loading}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      )}

      {stage === "result" && result && round && (
        <div className="result-section">
          <h3
            className={result.correct ? "result-correct" : "result-incorrect"}
          >
            {result.correct ? "Correct!" : "Incorrect"}
          </h3>
          <div className="result-details">
            <p>
              The correct answer was:{" "}
              <strong>{round.options[result.correctIndex]}</strong>
            </p>
            <p>
              Points {result.correct ? "gained" : "lost"}:{" "}
              <strong>
                {result.pointsDelta > 0 ? "+" : ""}
                {result.pointsDelta}
              </strong>
            </p>
            <p>
              New balance: <strong>{result.newBalance}</strong> points
            </p>
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={handlePlayAgain}
          >
            Play Again
          </button>
        </div>
      )}
    </div>
  );
}
