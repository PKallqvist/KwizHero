import { describe, expect, it } from "vitest";
import {
  resolveResults,
  stage1RankByScore,
  stage2ResolveTiebreaker,
  stage3LotteryFallback,
  type ParticipantScoreInput,
} from "./resultsWaterfall";

function participant(id: string, score: number, tiebreakerGuess?: number | null): ParticipantScoreInput {
  return { participantId: id, nickname: id, score, totalQuestions: 5, tiebreakerGuess };
}

describe("stage1RankByScore", () => {
  it("groups by exact score, descending", () => {
    const groups = stage1RankByScore([participant("a", 3), participant("b", 5), participant("c", 3)]);
    expect(groups.map((g) => g.score)).toEqual([5, 3]);
    expect(groups[1].participants.map((p) => p.participantId).sort()).toEqual(["a", "c"]);
  });
});

describe("stage2ResolveTiebreaker", () => {
  it("orders by closeness under the 'closest' rule", () => {
    const clusters = stage2ResolveTiebreaker(
      [participant("a", 5, 90), participant("b", 5, 110), participant("c", 5, 101)],
      { correctValue: 100, resolutionRule: "closest" }
    );
    expect(clusters.map((c) => c.map((p) => p.participantId))).toEqual([["c"], ["a", "b"]]);
  });

  it("disqualifies over-guesses under 'closest_under', falling back to lottery cluster", () => {
    const clusters = stage2ResolveTiebreaker(
      [participant("a", 5, 90), participant("b", 5, 110)],
      { correctValue: 100, resolutionRule: "closest_under" }
    );
    expect(clusters).toEqual([[expect.objectContaining({ participantId: "a" })], [expect.objectContaining({ participantId: "b" })]]);
  });

  it("returns the group untouched when there is no tiebreaker question", () => {
    const group = [participant("a", 5), participant("b", 5)];
    expect(stage2ResolveTiebreaker(group, null)).toEqual([group]);
  });

  it("clusters identical guesses together for the lottery", () => {
    const clusters = stage2ResolveTiebreaker(
      [participant("a", 5, 100), participant("b", 5, 100)],
      { correctValue: 100, resolutionRule: "closest" }
    );
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toHaveLength(2);
  });
});

describe("stage3LotteryFallback", () => {
  it("is deterministic for a given seed", () => {
    const group = [participant("a", 5), participant("b", 5), participant("c", 5)];
    const first = stage3LotteryFallback(group, "quiz-1:1");
    const second = stage3LotteryFallback(group, "quiz-1:1");
    expect(first.map((p) => p.participantId)).toEqual(second.map((p) => p.participantId));
  });

  it("produces a different order for a different seed (not guaranteed, but true for this fixture)", () => {
    const group = [participant("a", 5), participant("b", 5), participant("c", 5)];
    const ordered = stage3LotteryFallback(group, "quiz-1:1");
    const reordered = stage3LotteryFallback(group, "quiz-2:1");
    expect(ordered.map((p) => p.participantId)).not.toEqual(reordered.map((p) => p.participantId));
  });

  it("leaves a single-participant group untouched", () => {
    expect(stage3LotteryFallback([participant("a", 5)], "seed")).toEqual([participant("a", 5)]);
  });
});

describe("resolveResults", () => {
  it("ranks untied participants purely by score", () => {
    const results = resolveResults({
      quizId: "q1",
      participants: [participant("a", 3), participant("b", 5), participant("c", 1)],
      tiebreaker: null,
      lotterySeed: "q1:close",
    });
    expect(results.map((r) => [r.participantId, r.rank])).toEqual([
      ["b", 1],
      ["a", 2],
      ["c", 3],
    ]);
    expect(results.every((r) => !r.resolvedByLottery)).toBe(true);
  });

  it("resolves a score tie via the tiebreaker before falling back to lottery", () => {
    const results = resolveResults({
      quizId: "q1",
      participants: [participant("a", 5, 90), participant("b", 5, 110), participant("c", 5, 101)],
      tiebreaker: { correctValue: 100, resolutionRule: "closest" },
      lotterySeed: "q1:close",
    });
    const byId = Object.fromEntries(results.map((r) => [r.participantId, r]));
    expect(byId.c.rank).toBe(1);
    expect(byId.c.resolvedByLottery).toBe(false);
    expect(byId.c.tiedGroupSize).toBe(3);
    // a and b are equally close (10 away each) -> lottery decides between rank 2 and 3
    expect(new Set([byId.a.rank, byId.b.rank])).toEqual(new Set([2, 3]));
    expect(byId.a.resolvedByLottery).toBe(true);
    expect(byId.b.resolvedByLottery).toBe(true);
  });

  it("falls straight to lottery when there is no tiebreaker question and scores are tied", () => {
    const results = resolveResults({
      quizId: "q1",
      participants: [participant("a", 5), participant("b", 5)],
      tiebreaker: null,
      lotterySeed: "q1:close",
    });
    expect(results.every((r) => r.resolvedByLottery)).toBe(true);
    expect(new Set(results.map((r) => r.rank))).toEqual(new Set([1, 2]));
  });

  it("flags a lottery-decided top rank as a full win, not a diminished one", () => {
    const results = resolveResults({
      quizId: "q1",
      participants: [participant("a", 5), participant("b", 5)],
      tiebreaker: null,
      lotterySeed: "q1:close",
    });
    const winner = results.find((r) => r.rank === 1);
    expect(winner?.resolvedByLottery).toBe(true);
    expect(winner?.rank).toBe(1);
  });

  it("records tiebreakerDistance as the plain absolute gap regardless of resolutionRule", () => {
    const results = resolveResults({
      quizId: "q1",
      participants: [participant("a", 5, 90)],
      tiebreaker: { correctValue: 100, resolutionRule: "closest_under" },
      lotterySeed: "q1:close",
    });
    expect(results[0].tiebreakerDistance).toBe(10);
  });
});
