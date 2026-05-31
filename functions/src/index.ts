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
type AiTopicCategory =
  | "history"
  | "music"
  | "sports"
  | "climate"
  | "science"
  | "geography"
  | "culture"
  | "politics"
  | "nature"
  | "technology"
  | "food"
  | "art"
  | "custom";

interface AiQuestionGeneratorRequest {
  topic?: unknown;
  topicCategory?: unknown;
  freePrompt?: unknown;
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
  sourceUrl: string;
  sourceVerified: boolean;
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

function assertAllowedTopicCategory(value: unknown): AiTopicCategory {
  const categories: AiTopicCategory[] = [
    "history",
    "music",
    "sports",
    "climate",
    "science",
    "geography",
    "culture",
    "politics",
    "nature",
    "technology",
    "food",
    "art",
    "custom",
  ];
  if (typeof value === "string" && categories.includes(value as AiTopicCategory)) {
    return value as AiTopicCategory;
  }
  throw new HttpsError("invalid-argument", "topicCategory is invalid");
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
}

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isSearchResultsUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();

    if ((host.includes("google.") && path.startsWith("/search")) ||
      (host.includes("bing.com") && path.startsWith("/search")) ||
      (host.includes("duckduckgo.com") && path === "/") ||
      (host.includes("search.yahoo.com") && path.startsWith("/search"))) {
      return true;
    }

    return false;
  } catch {
    return true;
  }
}

async function isSourceUrlReachable(url: string): Promise<boolean> {
  const methods: Array<"HEAD" | "GET"> = ["HEAD", "GET"];

  for (const method of methods) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(url, {
        method,
        redirect: "follow",
        signal: controller.signal,
      });

      if (response.status >= 200 && response.status < 400) {
        return true;
      }

      if (method === "HEAD" && (response.status === 405 || response.status === 501)) {
        continue;
      }
    } catch {
      // Try GET after HEAD failures or transient network issues.
    } finally {
      clearTimeout(timeout);
    }
  }

  return false;
}

async function evaluateSourceVerification(sourceUrl: string): Promise<boolean> {
  if (!isValidHttpUrl(sourceUrl)) {
    return false;
  }
  if (isSearchResultsUrl(sourceUrl)) {
    return false;
  }
  return isSourceUrlReachable(sourceUrl);
}

function buildPrompt(input: {
  topic: string;
  topicCategory: AiTopicCategory;
  freePrompt: string;
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

  return `Generate a quiz question about: "${input.topic}"\nTopic category: ${input.topicCategory}\nAdditional request: "${input.freePrompt || "none"}"\nDifficulty: ${input.difficulty}\nQuestion type: ${input.questionType}\nLanguage: ${languageLabel}\n\nRespond with valid JSON only, using this exact shape:\n{\n  "question": "Question text",\n  "choices": [{ "text": "Choice", "correct": false }],\n  "numericAnswer": null,\n  "letterOrderAnswer": null,\n  "funFact": "Short interesting fact",\n  "sourceUrl": "https://..."\n}\n\nRules:\n- No markdown, no code fences\n- Exactly one field among numericAnswer/letterOrderAnswer should be used for non-multiple_choice types\n- Keep facts accurate and specific\n- sourceUrl must be a direct http/https page that supports the fact or answer\n- sourceUrl must be a real article/page URL, not a search results URL\n- Use the requested language\n${answerShapeInstructions}`;
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
    sourceUrl?: unknown;
  };

  const question = typeof candidate.question === "string" ? candidate.question.trim() : "";
  const funFact = typeof candidate.funFact === "string" ? candidate.funFact.trim() : "";
  const sourceUrl = typeof candidate.sourceUrl === "string" ? candidate.sourceUrl.trim() : "";
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
      sourceUrl,
      sourceVerified: false,
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
      sourceUrl,
      sourceVerified: false,
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
    sourceUrl,
    sourceVerified: false,
  };
}

async function callOpenAi(input: {
  topic: string;
  topicCategory: AiTopicCategory;
  freePrompt: string;
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

export const generateAiQuestionCallable = onCall({ invoker: "public" }, async (request) => {
  const data = (request.data ?? {}) as AiQuestionGeneratorRequest;
  const topic = typeof data.topic === "string" ? data.topic.trim() : "";
  const freePrompt = typeof data.freePrompt === "string" ? data.freePrompt.trim() : "";
  if (topic.length < 2) {
    throw new HttpsError("invalid-argument", "topic is required");
  }
  if (freePrompt.length > 300) {
    throw new HttpsError("invalid-argument", "freePrompt must be 300 characters or less");
  }

  const topicCategory = assertAllowedTopicCategory(data.topicCategory);
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
    topicCategory,
    freePrompt,
    difficulty,
    questionType,
    language,
    choiceCount,
    correctAnswerCount,
  });

  const parsedResponse = parseAndValidateResponse(rawContent, {
    questionType,
    choiceCount,
    correctAnswerCount,
  });

  const sourceVerified = await evaluateSourceVerification(parsedResponse.sourceUrl);

  return {
    ...parsedResponse,
    sourceVerified,
  };
});

export const publishQuizCallable = onCall({ invoker: "public" }, async (request) => {
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
