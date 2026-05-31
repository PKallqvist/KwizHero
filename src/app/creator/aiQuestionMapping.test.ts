import { describe, expect, it } from "vitest";
import type { AiQuestionGeneratorResponse } from "../../platform/ai/aiGenerator";
import { buildDraftQuestionFromAiResponse, mapAiErrorToI18nKey } from "./aiQuestionMapping";

const baseConfig = {
  timerSeconds: 30,
  numericTolerance: null,
};

describe("mapAiErrorToI18nKey", () => {
  it("maps rate-limit errors", () => {
    expect(mapAiErrorToI18nKey({ code: "resource-exhausted" })).toBe("creator.questions.aiErrorRateLimit");
  });

  it("maps missing key errors", () => {
    expect(mapAiErrorToI18nKey({ message: "openai-api-key-missing" })).toBe("creator.questions.aiErrorApiKeyMissing");
  });

  it("maps invalid json errors", () => {
    expect(mapAiErrorToI18nKey({ code: "invalid-argument" })).toBe("creator.questions.aiErrorInvalidJson");
  });

  it("maps unreachable source errors", () => {
    expect(mapAiErrorToI18nKey({ message: "source-url-unreachable" })).toBe("creator.questions.aiErrorSourceUnreachable");
  });

  it("falls back to network error", () => {
    expect(mapAiErrorToI18nKey({})).toBe("creator.questions.aiErrorNetwork");
  });
});

describe("buildDraftQuestionFromAiResponse", () => {
  it("maps numeric response to numeric draft fields", () => {
    const response: AiQuestionGeneratorResponse = {
      question: "How many meters?",
      choices: [],
      numericAnswer: 42,
      letterOrderAnswer: null,
      funFact: "A fun number",
      sourceUrl: "https://example.com/fun-number",
      sourceVerified: true,
    };

    const draft = buildDraftQuestionFromAiResponse({
      questionType: "numeric",
      response,
      config: baseConfig,
    });

    expect(draft.questionType).toBe("numeric");
    expect(draft.numericAnswer).toBe(42);
    expect(draft.choices).toEqual([]);
    expect(draft.funFact).toBe("A fun number");
    expect(draft.sourceUrl).toBe("https://example.com/fun-number");
  });

  it("maps letter-order response", () => {
    const response: AiQuestionGeneratorResponse = {
      question: "Order this",
      choices: [],
      numericAnswer: null,
      letterOrderAnswer: "ABC",
      funFact: "Alphabet fun",
      sourceUrl: "https://example.com/alphabet",
      sourceVerified: true,
    };

    const draft = buildDraftQuestionFromAiResponse({
      questionType: "letter_order",
      response,
      config: baseConfig,
    });

    expect(draft.questionType).toBe("letter_order");
    expect(draft.letterOrderAnswer).toBe("ABC");
    expect(draft.correctChoiceIndexes).toEqual([]);
  });

  it("maps multiple-choice response and preserves correct answer set after shuffle", () => {
    const response: AiQuestionGeneratorResponse = {
      question: "Choose planets",
      choices: [
        { text: "Mars", correct: true },
        { text: "Stockholm", correct: false },
        { text: "Venus", correct: true },
        { text: "Table", correct: false },
      ],
      numericAnswer: null,
      letterOrderAnswer: null,
      funFact: "Planets orbit stars",
      sourceUrl: "https://example.com/planets",
      sourceVerified: true,
    };

    const draft = buildDraftQuestionFromAiResponse({
      questionType: "multiple_choice",
      response,
      config: baseConfig,
    });

    const correctTexts = draft.correctChoiceIndexes.map((index) => draft.choices[index]).sort();
    expect(correctTexts).toEqual(["Mars", "Venus"]);
    expect(draft.funFact).toBe("Planets orbit stars");
  });
});
