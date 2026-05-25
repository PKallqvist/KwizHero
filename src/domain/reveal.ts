import type { RevealMode } from "./types";

export type RevealPhase = "full" | "score_only" | "hidden";

export function resolveRevealPhase(
  revealMode: RevealMode,
  sessionComplete: boolean,
  revealAt: string | null
): RevealPhase {
  if (revealMode === "instant") return "full";
  if (revealMode === "on_completion") return sessionComplete ? "full" : "score_only";
  if (revealMode === "scheduled") {
    if (!revealAt) return "hidden";
    return Date.now() >= new Date(revealAt).getTime() ? "full" : "hidden";
  }
  return "hidden";
}
