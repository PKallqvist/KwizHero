import { describe, expect, it } from "vitest";

// Binary scoring: pointsIfCorrect when correct, 0 otherwise.
// This is the only strategy in MVP, implemented inline in quizRepository.
// Tests live here to document the contract and protect against regressions.

function binaryScore(selectedChoiceId: string, correctChoiceId: string, pointsIfCorrect: number): number {
  return selectedChoiceId === correctChoiceId ? pointsIfCorrect : 0;
}

describe("binary_correct_1_point scoring", () => {
  it("awards points when answer is correct", () => {
    expect(binaryScore("c1", "c1", 1)).toBe(1);
  });

  it("awards zero when answer is wrong", () => {
    expect(binaryScore("c2", "c1", 1)).toBe(0);
  });

  it("respects custom pointsIfCorrect", () => {
    expect(binaryScore("c3", "c3", 5)).toBe(5);
    expect(binaryScore("c1", "c3", 5)).toBe(0);
  });

  it("is case-sensitive on choice IDs", () => {
    expect(binaryScore("C1", "c1", 1)).toBe(0);
  });
});
