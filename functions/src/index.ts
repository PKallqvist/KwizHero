import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";

type AiProvider = "anthropic" | "openai";

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
  variationSeed: string;
}): string {
  const languageLabel = input.language === "sv" ? "Svenska" : "English";
  const answerShapeInstructions =
    input.questionType === "multiple_choice"
      ? `A/B/C rules:\n- Return exactly ${input.choiceCount} choices\n- Mark exactly ${input.correctAnswerCount} choices with "correct": true\n- All wrong answers must be plausible, never silly`
      : input.questionType === "numeric"
        ? "123 rules:\n- Set choices to []\n- numericAnswer must be a precise number, year, or quantity\n- letterOrderAnswer must be null"
        : "ABC rules:\n- Set choices to []\n- letterOrderAnswer must be a single correct word or very short phrase\n- numericAnswer must be null";

  return `You are a quiz question generator for KwizHero, an outdoor quiz app where players move between waypoints and answer questions.\n\nQuestions can be about absolutely anything. The topic is always provided by the creator. Do not assume questions must be location-based or related to outdoors.\n\nGeneration brief:\n- Topic: "${input.topic}"\n- Topic category: ${input.topicCategory}\n- Creator request: "${input.freePrompt || "none"}"\n- Difficulty: ${input.difficulty}\n- Question type: ${input.questionType}\n- Language: ${languageLabel}\n\nTone and style:\n- Questions should feel surprising and rewarding to know\n- Favor unexpected angles and lesser-known but verifiable facts\n- Avoid trivial obvious questions\n- Avoid unfairly obscure questions\n- Wrong answers must be plausible\n- Fun fact must add context or surprise, not restate the answer\n\nDifficulty guide:\n- easy: likely known by a casual interested person\n- medium: requires genuine knowledge or curiosity\n- hard: suited for enthusiasts, but still fair\n\nQuality checklist (apply before responding):\n- Question has one unambiguous correct answer\n- Correct answer is factual and verifiable\n- Distractors are plausible\n- Fun fact adds value beyond restating the answer\n- Wording is specific enough to avoid ambiguity\n\n${answerShapeInstructions}\n\nOutput format:\n- Return valid JSON only\n- No markdown, no code fences\n- Use exactly this shape:\n{\n  "question": "Question text",\n  "choices": [{ "text": "Choice", "correct": false }],\n  "numericAnswer": null,\n  "letterOrderAnswer": null,\n  "funFact": "Short interesting fact",\n  "sourceUrl": "https://..."\n}\n\nSource rules:\n- sourceUrl must be a direct http/https page URL\n- sourceUrl must support the fact or answer\n- sourceUrl must not be a search results URL\n\nEach time you are called, generate a different question than you might have before. Vary the angle, the specific fact chosen, and the difficulty within the given level.\n\n(variation seed: ${input.variationSeed})`;
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
    throw new HttpsError("invalid-argument", "ai-invalid-json");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new HttpsError("invalid-argument", "ai-invalid-json");
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
    throw new HttpsError("invalid-argument", "ai-invalid-json");
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
      throw new HttpsError("invalid-argument", "ai-invalid-json");
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
      throw new HttpsError("invalid-argument", "ai-invalid-json");
    }
    const numericAnswer = typeof candidate.numericAnswer === "number" && Number.isFinite(candidate.numericAnswer)
      ? candidate.numericAnswer
      : null;
    if (numericAnswer === null) {
      throw new HttpsError("invalid-argument", "ai-invalid-json");
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
    throw new HttpsError("invalid-argument", "ai-invalid-json");
  }
  const letterOrderAnswer =
    typeof candidate.letterOrderAnswer === "string" && candidate.letterOrderAnswer.trim().length > 1
      ? candidate.letterOrderAnswer.trim()
      : null;
  if (!letterOrderAnswer) {
    throw new HttpsError("invalid-argument", "ai-invalid-json");
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

interface AiCallInput {
  topic: string;
  topicCategory: AiTopicCategory;
  freePrompt: string;
  difficulty: AiDifficulty;
  questionType: QuestionType;
  language: AiLanguage;
  choiceCount: number;
  correctAnswerCount: number;
}

function getAiProvider(): AiProvider {
  const provider = (process.env.AI_PROVIDER ?? "anthropic").toLowerCase();
  if (provider === "openai" || provider === "anthropic") return provider;
  return "anthropic";
}

async function callAnthropic(input: AiCallInput): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    throw new HttpsError("failed-precondition", "ai-api-key-missing");
  }

  const variationSeed = Math.random().toString(36).substring(2, 9);
  const client = new Anthropic({ apiKey });

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: "You are a high-quality quiz question generator for KwizHero. Always respond with valid JSON only. No preamble, no explanation, no markdown code fences.",
      messages: [
        {
          role: "user",
          content: buildPrompt({ ...input, variationSeed }),
        },
      ],
    });
  } catch (error: unknown) {
    if (error instanceof Anthropic.RateLimitError) {
      throw new HttpsError("resource-exhausted", "ai-rate-limited");
    }
    if (error instanceof Anthropic.AuthenticationError) {
      throw new HttpsError("failed-precondition", "ai-api-key-missing");
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error("Anthropic API error:", message);
    throw new HttpsError("unavailable", "ai-request-failed");
  }

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text" || textBlock.text.trim().length === 0) {
    throw new HttpsError("invalid-argument", "ai-invalid-json");
  }
  return textBlock.text;
}

async function callOpenAi(input: AiCallInput): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    throw new HttpsError("failed-precondition", "ai-api-key-missing");
  }

  const variationSeed = Math.random().toString(36).substring(2, 9);

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
            "You are a high-quality quiz question generator for KwizHero. Always respond with valid JSON only. No preamble, no explanation, no markdown code fences.",
        },
        {
          role: "user",
          content: buildPrompt({ ...input, variationSeed }),
        },
      ],
    }),
  });

  if (response.status === 429) {
    throw new HttpsError("resource-exhausted", "ai-rate-limited");
  }
  if (!response.ok) {
    throw new HttpsError("unavailable", "ai-request-failed");
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content || content.trim().length === 0) {
    throw new HttpsError("invalid-argument", "ai-invalid-json");
  }
  return content;
}

async function callAiProvider(input: AiCallInput): Promise<string> {
  const provider = getAiProvider();
  return provider === "anthropic" ? callAnthropic(input) : callOpenAi(input);
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

  const rawContent = await callAiProvider({
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
