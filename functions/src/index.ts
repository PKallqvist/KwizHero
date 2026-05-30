import { createHash } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";

initializeApp();
const db = getFirestore();

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

type AiDifficulty = "easy" | "medium" | "hard";
type AiLanguage = "sv" | "en";
type QuestionType = "multiple_choice" | "numeric" | "letter_order";

interface AiQuestionGeneratorRequest {
  topic?: unknown;
  difficulty?: unknown;
  questionType?: unknown;
  language?: unknown;
  choiceCount?: unknown;
  correctAnswerCount?: unknown;
}

interface AiGeneratedChoice {
  text: string;
  correct: boolean;
}

interface AiQuestionGeneratorResponse {
  question: string;
  choices: AiGeneratedChoice[];
  numericAnswer: number | null;
  letterOrderAnswer: string | null;
  funFact: string;
}

function stripJsonFences(value: string): string {
  const trimmed = value.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function assertAllowedDifficulty(value: unknown): AiDifficulty {
  if (value === "easy" || value === "medium" || value === "hard") return value;
  throw new HttpsError("invalid-argument", "difficulty must be easy, medium, or hard");
}

function assertAllowedLanguage(value: unknown): AiLanguage {
  if (value === "sv" || value === "en") return value;
  throw new HttpsError("invalid-argument", "language must be sv or en");
}

function assertAllowedQuestionType(value: unknown): QuestionType {
  if (value === "multiple_choice" || value === "numeric" || value === "letter_order") return value;
  throw new HttpsError("invalid-argument", "questionType must be multiple_choice, numeric, or letter_order");
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
}

function buildPrompt(input: {
  topic: string;
  difficulty: AiDifficulty;
  questionType: QuestionType;
  language: AiLanguage;
  choiceCount: number;
  correctAnswerCount: number;
}): string {
  const languageLabel = input.language === "sv" ? "Svenska" : "English";
  const answerShapeInstructions =
    input.questionType === "multiple_choice"
      ? `For multiple_choice:\n- Return exactly ${input.choiceCount} choices\n- Mark exactly ${input.correctAnswerCount} choices with "correct": true`
      : input.questionType === "numeric"
        ? "For numeric:\n- Set choices to []\n- Set numericAnswer to the one correct number"
        : "For letter_order:\n- Set choices to []\n- Set letterOrderAnswer to the one correct short text answer";

  return `Generate a quiz question about: "${input.topic}"\nDifficulty: ${input.difficulty}\nQuestion type: ${input.questionType}\nLanguage: ${languageLabel}\n\nRespond with valid JSON only, using this exact shape:\n{\n  "question": "Question text",\n  "choices": [{ "text": "Choice", "correct": false }],\n  "numericAnswer": null,\n  "letterOrderAnswer": null,\n  "funFact": "Short interesting fact"\n}\n\nRules:\n- No markdown, no code fences\n- Exactly one field among numericAnswer/letterOrderAnswer should be used for non-multiple_choice types\n- Keep facts accurate and specific\n- Use the requested language\n${answerShapeInstructions}`;
}

function parseAndValidateResponse(rawText: string, expected: {
  questionType: QuestionType;
  choiceCount: number;
  correctAnswerCount: number;
}): AiQuestionGeneratorResponse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFences(rawText));
  } catch {
    throw new HttpsError("invalid-argument", "invalid-json-from-openai");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new HttpsError("invalid-argument", "invalid-json-from-openai");
  }

  const candidate = parsed as {
    question?: unknown;
    choices?: unknown;
    numericAnswer?: unknown;
    letterOrderAnswer?: unknown;
    funFact?: unknown;
  };

  const question = typeof candidate.question === "string" ? candidate.question.trim() : "";
  const funFact = typeof candidate.funFact === "string" ? candidate.funFact.trim() : "";
  if (question.length < 4 || funFact.length < 4) {
    throw new HttpsError("invalid-argument", "invalid-json-from-openai");
  }

  const normalizedChoices = Array.isArray(candidate.choices)
    ? candidate.choices
        .map((choice) => {
          if (!choice || typeof choice !== "object") return null;
          const text = typeof (choice as { text?: unknown }).text === "string" ? (choice as { text: string }).text.trim() : "";
          const correct = Boolean((choice as { correct?: unknown }).correct);
          if (!text) return null;
          return { text, correct };
        })
        .filter((choice): choice is AiGeneratedChoice => choice !== null)
    : [];

  if (expected.questionType === "multiple_choice") {
    const correctCount = normalizedChoices.filter((choice) => choice.correct).length;
    if (normalizedChoices.length !== expected.choiceCount || correctCount !== expected.correctAnswerCount) {
      throw new HttpsError("invalid-argument", "invalid-json-from-openai");
    }
    return {
      question,
      choices: normalizedChoices,
      numericAnswer: null,
      letterOrderAnswer: null,
      funFact,
    };
  }

  if (expected.questionType === "numeric") {
    if (normalizedChoices.length > 0) {
      throw new HttpsError("invalid-argument", "invalid-json-from-openai");
    }
    const numericAnswer = typeof candidate.numericAnswer === "number" && Number.isFinite(candidate.numericAnswer)
      ? candidate.numericAnswer
      : null;
    if (numericAnswer === null) {
      throw new HttpsError("invalid-argument", "invalid-json-from-openai");
    }
    return {
      question,
      choices: [],
      numericAnswer,
      letterOrderAnswer: null,
      funFact,
    };
  }

  if (normalizedChoices.length > 0) {
    throw new HttpsError("invalid-argument", "invalid-json-from-openai");
  }
  const letterOrderAnswer =
    typeof candidate.letterOrderAnswer === "string" && candidate.letterOrderAnswer.trim().length > 1
      ? candidate.letterOrderAnswer.trim()
      : null;
  if (!letterOrderAnswer) {
    throw new HttpsError("invalid-argument", "invalid-json-from-openai");
  }
  return {
    question,
    choices: [],
    numericAnswer: null,
    letterOrderAnswer,
    funFact,
  };
}

async function callOpenAi(input: {
  topic: string;
  difficulty: AiDifficulty;
  questionType: QuestionType;
  language: AiLanguage;
  choiceCount: number;
  correctAnswerCount: number;
}): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    throw new HttpsError("failed-precondition", "openai-api-key-missing");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content:
            "You are a quiz question generator for KwizHero, a location-based outdoor quiz app. Always respond with valid JSON only. No preamble, no explanation, no markdown code fences.",
        },
        {
          role: "user",
          content: buildPrompt(input),
        },
      ],
    }),
  });

  if (response.status === 429) {
    throw new HttpsError("resource-exhausted", "openai-rate-limited");
  }
  if (!response.ok) {
    throw new HttpsError("unavailable", "openai-request-failed");
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content || content.trim().length === 0) {
    throw new HttpsError("invalid-argument", "invalid-json-from-openai");
  }
  return content;
}

export const generateAiQuestionCallable = onCall(async (request) => {
  const data = (request.data ?? {}) as AiQuestionGeneratorRequest;
  const topic = typeof data.topic === "string" ? data.topic.trim() : "";
  if (topic.length < 2) {
    throw new HttpsError("invalid-argument", "topic is required");
  }

  const difficulty = assertAllowedDifficulty(data.difficulty);
  const questionType = assertAllowedQuestionType(data.questionType);
  const language = assertAllowedLanguage(data.language);

  const choiceCount = normalizePositiveInteger(data.choiceCount, 4);
  const correctAnswerCount = normalizePositiveInteger(data.correctAnswerCount, 1);
  if (questionType === "multiple_choice") {
    if (choiceCount < 2 || choiceCount > 8) {
      throw new HttpsError("invalid-argument", "choiceCount must be between 2 and 8");
    }
    if (correctAnswerCount > choiceCount) {
      throw new HttpsError("invalid-argument", "correctAnswerCount cannot exceed choiceCount");
    }
  }

  const rawContent = await callOpenAi({
    topic,
    difficulty,
    questionType,
    language,
    choiceCount,
    correctAnswerCount,
  });

  return parseAndValidateResponse(rawContent, {
    questionType,
    choiceCount,
    correctAnswerCount,
  });
});

export const publishQuizCallable = onCall(async (request) => {
  const quizId = String(request.data?.quizId ?? "").trim();
  const editKey = String(request.data?.editKey ?? "").trim();

  if (!quizId || !editKey) {
    throw new HttpsError("invalid-argument", "quizId and editKey are required");
  }

  const secretSnap = await db.collection("quizSecrets").doc(quizId).get();
  if (!secretSnap.exists) {
    throw new HttpsError("not-found", "Quiz secret not found");
  }

  const storedHash = String(secretSnap.get("editKeyHash") ?? "");
  const incomingHash = sha256Hex(editKey);
  if (!storedHash || incomingHash !== storedHash) {
    throw new HttpsError("permission-denied", "Invalid edit key");
  }

  const quizRef = db.collection("quizzes").doc(quizId);
  const quizSnap = await quizRef.get();
  if (!quizSnap.exists) {
    throw new HttpsError("not-found", "Quiz not found");
  }

  const status = String(quizSnap.get("status") ?? "draft");
  if (status === "published") {
    return { ok: true, status: "published" };
  }

  await quizRef.update({
    status: "published",
    publishedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { ok: true, status: "published" };
});
