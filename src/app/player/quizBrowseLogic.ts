import type { PlayerQuizHistoryItem } from "../../platform/firebase/quizRepository";
import type { QuizSummary } from "../../platform/firebase/quizRepository";

export type BrowseFavoriteGroup = "new" | "waiting" | "completed";

export function classifyBrowseFavoriteGroup(params: {
  history: PlayerQuizHistoryItem | null;
  summary: QuizSummary | null;
  nowMs?: number;
} | null): BrowseFavoriteGroup {
  if (!params) return "new";
  const { history, summary, nowMs = Date.now() } = params;
  if (!history) return "new";

  if (history.status === "active") {
    return "waiting";
  }

  if (summary?.revealMode === "scheduled" && summary.revealAt) {
    const revealAtMs = Date.parse(summary.revealAt);
    if (Number.isFinite(revealAtMs) && revealAtMs > nowMs) {
      return "waiting";
    }
  }

  return "completed";
}
