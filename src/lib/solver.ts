export type Result = "correct" | "present" | "absent";
export type Guess = { word: string; feedback: Result[] };
export type StopReason = "solved" | "out-of-guesses" | "no-candidates";
export type SolveResult = { solved: boolean; reason: StopReason; guesses: Guess[] };
export type GuessFn = (word: string) => Promise<Result[]>;
