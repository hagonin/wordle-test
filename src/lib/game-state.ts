import type { Guess, StopReason } from "./solver";

export type GameState =
  | { status: "idle" }
  | { status: "playing"; seed: number; rows: Guess[]; attempt: number }
  | { status: "done"; seed: number; rows: Guess[]; reason: StopReason }
  | { status: "error"; seed: number; rows: Guess[]; message: string };

export type GameAction =
  | { type: "start"; seed: number }
  | { type: "attempt"; attempt: number }
  | { type: "row"; row: Guess }
  | { type: "finish"; reason: StopReason }
  | { type: "fail"; message: string };

export const initialGameState: GameState = { status: "idle" };

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "start":
      if (state.status === "playing") return state;
      return { status: "playing", seed: action.seed, rows: [], attempt: 0 };
    case "attempt":
      if (state.status !== "playing") return state;
      return { ...state, attempt: action.attempt };
    case "row":
      if (state.status !== "playing") return state;
      return { ...state, rows: [...state.rows, action.row] };
    case "finish":
      if (state.status !== "playing") return state;
      return { status: "done", seed: state.seed, rows: state.rows, reason: action.reason };
    case "fail":
      if (state.status !== "playing") return state;
      return { status: "error", seed: state.seed, rows: state.rows, message: action.message };
    default: {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _exhaustive: never = action;
      return state;
    }
  }
}
