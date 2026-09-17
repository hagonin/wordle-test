"use client";

import { useReducer } from "react";
import styles from "./page.module.css";
import { gameReducer, initialGameState } from "../lib/game-state";
import { postGuess } from "../lib/guess-client";
import { describeOutcome } from "../lib/outcome";
import { MAX_GUESSES } from "../lib/constants";
import type { Result } from "../lib/solver";

const PAUSE_MS = 600;

const RESULT_CLASS: Record<Result, string> = {
  correct: styles.correct,
  present: styles.present,
  absent: styles.absent,
};

export default function Home() {
  const [state, dispatch] = useReducer(gameReducer, initialGameState);

  async function play() {
    const seed = Math.floor(Math.random() * 1_000_000_000);
    dispatch({ type: "start", seed });

    let attempt = 0;

    async function guessFn(word: string): Promise<Result[]> {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
      }
      attempt += 1;
      dispatch({ type: "attempt", attempt });
      const feedback = await postGuess(word, seed);
      dispatch({ type: "row", row: { word, feedback } });
      return feedback;
    }

    try {
      const { solve } = await import("../lib/solver");
      const result = await solve(guessFn);
      dispatch({ type: "finish", reason: result.reason });
    } catch (err) {
      dispatch({
        type: "fail",
        message: err instanceof Error ? err.message : "Something went wrong",
      });
    }
  }

  const rows = state.status === "idle" ? [] : state.rows;
  const emptyRowCount = MAX_GUESSES - rows.length;
  const outcome = state.status === "done" ? describeOutcome(state.reason, state.rows.length) : null;
  const outcomeToneClass =
    state.status === "done" ? (state.reason === "solved" ? styles.solved : styles.notSolved) : "";

  return (
    <main className={styles.page}>
      <h1>Wordle Auto-Solver</h1>

      <div className={styles.controls}>
        <button className={styles.button} onClick={play} disabled={state.status === "playing"}>
          {state.status === "playing" ? "Solving…" : "Solve"}
        </button>
        {state.status !== "idle" && <span className={styles.seed}>Seed {state.seed}</span>}
      </div>

      <div className={styles.board}>
        {rows.map((row, rowIndex) => (
          <div
            key={rowIndex}
            className={styles.row}
            role="group"
            aria-label={`Guess ${rowIndex + 1}`}
          >
            {row.word.split("").map((letter, letterIndex) => {
              const result = row.feedback[letterIndex];
              return (
                <span
                  key={letterIndex}
                  className={`${styles.tile} ${RESULT_CLASS[result]}`}
                  aria-label={`${letter.toUpperCase()}, ${result}`}
                >
                  {letter.toUpperCase()}
                </span>
              );
            })}
          </div>
        ))}
        {Array.from({ length: emptyRowCount }).map((_, rowIndex) => (
          <div key={`empty-${rowIndex}`} className={styles.row}>
            {Array.from({ length: 5 }).map((_, tileIndex) => (
              <span
                key={tileIndex}
                className={`${styles.tile} ${styles.empty}`}
                aria-hidden="true"
              />
            ))}
          </div>
        ))}
      </div>

      <p className={styles.status} aria-live="polite">
        {state.status === "playing" ? `Guess ${state.attempt}/${MAX_GUESSES}…` : ""}
      </p>

      <div className={`${styles.outcome} ${outcomeToneClass}`} aria-live="polite">
        {outcome && (
          <>
            <p className={styles.result}>{outcome.result}</p>
            {outcome.detail && <p className={styles.detail}>{outcome.detail}</p>}
          </>
        )}
      </div>

      <p className={styles.error} aria-live="polite">
        {state.status === "error" ? state.message : ""}
      </p>
    </main>
  );
}
