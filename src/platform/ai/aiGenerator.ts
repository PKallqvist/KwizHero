import { httpsCallable } from "firebase/functions";
import { getFirebaseServices } from "../firebase/firebase";
import type { QuestionType } from "../../domain/types";

export type AiDifficulty = "easy" | "medium" | "hard";
export type AiLanguage = "sv" | "en";

export interface AiQuestionGeneratorRequest {
  topic: string;
  difficulty: AiDifficulty;
  questionType: QuestionType;
  language: AiLanguage;
  choiceCount?: number;
  correctAnswerCount?: number;
}

export interface AiGeneratedChoice {
  text: string;
  correct: boolean;
}

export interface AiQuestionGeneratorResponse {
  question: string;
  choices: AiGeneratedChoice[];
  numericAnswer: number | null;
  letterOrderAnswer: string | null;
  funFact: string;
}

export async function generateAiQuestion(
  request: AiQuestionGeneratorRequest
): Promise<AiQuestionGeneratorResponse> {
  const { functions } = getFirebaseServices();
  const callable = httpsCallable<AiQuestionGeneratorRequest, AiQuestionGeneratorResponse>(
    functions,
    "generateAiQuestionCallable"
  );
  const result = await callable(request);
  return result.data;
}
