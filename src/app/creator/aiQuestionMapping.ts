import type { DraftQuestionInput, QuestionConfig, QuestionType } from "../../domain/types";
import type { AiQuestionGeneratorResponse } from "../../platform/ai/aiGenerator";

function shuffleArray<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function mapAiErrorToI18nKey(error: unknown): string {
  const code = String((error as { code?: string }).code ?? "");
  const message = String((error as { message?: string }).message ?? "");

  if (code.includes("resource-exhausted") || message.includes("ai-rate-limited")) {
    return "creator.questions.aiErrorRateLimit";
  }
  if (code.includes("failed-precondition") || message.includes("ai-api-key-missing")) {
    return "creator.questions.aiErrorApiKeyMissing";
  }
  if (message.includes("source-url-unreachable")) {
    return "creator.questions.aiErrorSourceUnreachable";
  }
  if (code.includes("invalid-argument") || message.includes("ai-invalid-json")) {
    return "creator.questions.aiErrorInvalidJson";
  }
  if (code.includes("unavailable") || code.includes("network")) {
    return "creator.questions.aiErrorNetwork";
  }
  return "creator.questions.aiErrorNetwork";
}

export function buildDraftQuestionFromAiResponse(params: {
  questionType: QuestionType;
  response: AiQuestionGeneratorResponse;
  config: QuestionConfig;
}): DraftQuestionInput {
  const { questionType, response, config } = params;

  if (questionType === "multiple_choice") {
    const shuffledChoices = shuffleArray(response.choices);
    return {
      questionType,
      text: response.question,
      choices: shuffledChoices.map((choice) => choice.text),
      correctChoiceIndexes: shuffledChoices
        .map((choice, index) => (choice.correct ? index : -1))
        .filter((index) => index >= 0),
      numericAnswer: null,
      letterOrderAnswer: null,
      funFact: response.funFact,
      sourceUrl: response.sourceUrl,
      config,
    };
  }

  if (questionType === "numeric") {
    return {
      questionType,
      text: response.question,
      choices: [],
      correctChoiceIndexes: [],
      numericAnswer: response.numericAnswer,
      letterOrderAnswer: null,
      funFact: response.funFact,
      sourceUrl: response.sourceUrl,
      config,
    };
  }

  return {
    questionType,
    text: response.question,
    choices: [],
    correctChoiceIndexes: [],
    numericAnswer: null,
    letterOrderAnswer: response.letterOrderAnswer,
    funFact: response.funFact,
    sourceUrl: response.sourceUrl,
    config,
  };
}
