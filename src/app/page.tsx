"use client";

import { useReducer } from "react";
import { gameReducer, initialGameState } from "../lib/game-state";
import { postGuess } from "../lib/guess-client";
import type { Result } from "../lib/solver";

const PAUSE_MS = 600;

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

  return (
    <main>
      <button onClick={play} disabled={state.status === "playing"}>
        {state.status === "playing" ? "Solving…" : "Solve"}
      </button>
    </main>
  );
}
