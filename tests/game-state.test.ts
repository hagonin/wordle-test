import { describe, expect, it } from "vitest";
import type { Guess } from "../src/lib/solver";
import { gameReducer, initialGameState, type GameState } from "../src/lib/game-state";

const row = (word: string): Guess => ({
  word,
  feedback: ["absent", "absent", "absent", "absent", "absent"],
});

const playingState: GameState = {
  status: "playing",
  seed: 42,
  rows: [row("crane")],
  attempt: 1,
};

describe("gameReducer", () => {
  it("start from idle begins a fresh game", () => {
    const next = gameReducer(initialGameState, { type: "start", seed: 123 });
    expect(next).toEqual({ status: "playing", seed: 123, rows: [], attempt: 0 });
  });

  it("attempt and row apply while playing, in order", () => {
    let state: GameState = { status: "playing", seed: 1, rows: [], attempt: 0 };
    state = gameReducer(state, { type: "attempt", attempt: 1 });
    state = gameReducer(state, { type: "row", row: row("crane") });
    state = gameReducer(state, { type: "attempt", attempt: 2 });
    state = gameReducer(state, { type: "row", row: row("hoist") });

    expect(state).toEqual({
      status: "playing",
      seed: 1,
      rows: [row("crane"), row("hoist")],
      attempt: 2,
    });
  });

  it("finish while playing moves to done, keeping seed and rows", () => {
    const next = gameReducer(playingState, { type: "finish", reason: "solved" });
    expect(next).toEqual({
      status: "done",
      seed: 42,
      rows: [row("crane")],
      reason: "solved",
    });
  });

  it("fail while playing moves to error, keeping seed, rows and message", () => {
    const next = gameReducer(playingState, { type: "fail", message: "Something went wrong" });
    expect(next).toEqual({
      status: "error",
      seed: 42,
      rows: [row("crane")],
      message: "Something went wrong",
    });
  });

  it("ignores start while already playing", () => {
    const next = gameReducer(playingState, { type: "start", seed: 999 });
    expect(next).toBe(playingState);
  });

  it.each([
    ["idle", { status: "idle" } as GameState],
    [
      "done",
      { status: "done", seed: 1, rows: [row("crane")], reason: "solved" } as GameState,
    ],
    [
      "error",
      { status: "error", seed: 1, rows: [row("crane")], message: "oops" } as GameState,
    ],
  ])("ignores row, attempt, finish and fail while %s", (_name, state) => {
    expect(gameReducer(state, { type: "attempt", attempt: 3 })).toBe(state);
    expect(gameReducer(state, { type: "row", row: row("spoil") })).toBe(state);
    expect(gameReducer(state, { type: "finish", reason: "solved" })).toBe(state);
    expect(gameReducer(state, { type: "fail", message: "oops" })).toBe(state);
  });

  it("start from done begins a fresh game with empty rows", () => {
    const done: GameState = {
      status: "done",
      seed: 1,
      rows: [row("crane"), row("hoist")],
      reason: "solved",
    };
    const next = gameReducer(done, { type: "start", seed: 456 });
    expect(next).toEqual({ status: "playing", seed: 456, rows: [], attempt: 0 });
  });

  it("start from error begins a fresh game with empty rows", () => {
    const errored: GameState = {
      status: "error",
      seed: 1,
      rows: [row("crane")],
      message: "oops",
    };
    const next = gameReducer(errored, { type: "start", seed: 789 });
    expect(next).toEqual({ status: "playing", seed: 789, rows: [], attempt: 0 });
  });

  it("does not mutate the input state or its rows array on row", () => {
    const original: GameState = { status: "playing", seed: 1, rows: [row("crane")], attempt: 1 };
    const originalRows = original.rows;

    const next = gameReducer(original, { type: "row", row: row("hoist") });

    expect(originalRows).toHaveLength(1);
    expect(originalRows[0]).toEqual(row("crane"));
    expect(original.rows).toBe(originalRows);
    if (next.status === "playing") {
      expect(next.rows).not.toBe(originalRows);
    } else {
      throw new Error("expected next state to still be playing");
    }
  });
});
