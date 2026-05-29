import { describe, expect, it } from "vitest";
import { classifyBrowseFavoriteGroup } from "./quizBrowseLogic";

describe("classifyBrowseFavoriteGroup", () => {
  it("returns new when there is no history yet", () => {
    expect(classifyBrowseFavoriteGroup({ history: null, summary: null })).toBe("new");
  });

  it("returns waiting when the latest history is still active", () => {
    expect(
      classifyBrowseFavoriteGroup({
        history: {
          sessionId: "s1",
          quizId: "q1",
          status: "active",
          score: 0,
          startedAt: null,
          completedAt: null,
        },
        summary: null,
      })
    ).toBe("waiting");
  });

  it("returns completed when the latest history is complete", () => {
    expect(
      classifyBrowseFavoriteGroup({
        history: {
          sessionId: "s1",
          quizId: "q1",
          status: "completed",
          score: 6,
          startedAt: null,
          completedAt: null,
        },
        summary: null,
      })
    ).toBe("completed");
  });

  it("keeps scheduled reveal quizzes in waiting until revealAt passes", () => {
    expect(
      classifyBrowseFavoriteGroup({
        history: {
          sessionId: "s1",
          quizId: "q1",
          status: "completed",
          score: 6,
          startedAt: null,
          completedAt: null,
        },
        summary: {
          id: "q1",
          title: "Quiz",
          description: "",
          status: "published",
          organizerName: null,
          organizerAvatarUrl: null,
          organizerSwish: null,
          isAnonymous: false,
          openAt: "2026-05-29T00:00:00.000Z",
          closeAt: "2026-05-30T00:00:00.000Z",
          questionTimeLimitSeconds: null,
          interQuestionTimeLimitSeconds: null,
          revealMode: "scheduled",
          revealAt: "2099-01-01T00:00:00.000Z",
          waypointGateRadiusMeters: 40,
          requireSequentialWaypoints: true,
          routeMode: "crow",
          questionOrderMode: "fixed",
        },
        nowMs: Date.parse("2026-05-30T00:00:00.000Z"),
      })
    ).toBe("waiting");
  });
});
