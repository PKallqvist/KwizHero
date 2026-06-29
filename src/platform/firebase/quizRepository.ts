import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  runTransaction,
  updateDoc,
  where,
} from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { getFirebaseServices } from "./firebase";
import { routeDistanceMeters } from "../map/geolocation";
import type { Coordinates } from "../map/geolocation";
import type { BadgeProgressState, BadgeUnlockEvent } from "../../domain/badges";
import type {
  AnswerResult,
  FirstPlayable,
  LeaderboardEntry,
  PlayerEarnedBadge,
  QuestionOrderMode,
  QuizDraftInput,
  QuizListItem,
  RouteMode,
  QuizSummary,
  QuizWalk,
  QuestionType,
  UserTokens,
} from "../../domain/types";

async function getCurrentAuthUid(): Promise<string> {
  const { auth } = getFirebaseServices();
  if (auth.currentUser) return auth.currentUser.uid;
  const credential = await signInAnonymously(auth);
  return credential.user.uid;
}

export async function getCurrentUserUid(): Promise<string> {
  return getCurrentAuthUid();
}

export interface PlayerBadgeProgressSnapshot extends BadgeProgressState {
  firstDiscoverySeen: boolean;
  firstDiscoveryProfileLabelSeen: boolean;
  aiTokens: number;
  aiTokensGranted: number;
  aiTokensPurchased: number;
  aiTokensUsed: number;
  aiTokensResetDate: string | null;
}

export interface AiTokenConsumeResult {
  aiTokens: number;
  aiTokensUsed: number;
}

function buildBadgeUnlockId(event: BadgeUnlockEvent): string {
  return event.type === "discovery" ? `discovery_${event.badgeId}` : `tiered_${event.badgeId}_${event.tier ?? 0}`;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

function getDefaultAiTokensResetDate(): string {
  const now = new Date();
  return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
}

function normalizeTokenNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

export async function getPlayerBadgeProgress(): Promise<PlayerBadgeProgressSnapshot> {
  const { db } = getFirebaseServices();
  const uid = await getCurrentAuthUid();
  const profileDoc = await getDoc(doc(db, "playerProfiles", uid));

  const profileData = profileDoc.data() as {
    quizzesCompleted?: number;
    quizzesCreatedPublished?: number;
    quizzesPlayedTotal?: number;
    playStreakDays?: number;
    perfectQuizzesCompleted?: number;
    lastCompletedQuizDate?: string | null;
    triggeredEventKeys?: unknown;
    earnedTierByBadgeId?: Record<string, unknown>;
    earnedDiscoveryBadgeIds?: unknown;
    firstDiscoverySeen?: boolean;
    firstDiscoveryProfileLabelSeen?: boolean;
    aiTokens?: number;
    aiTokensGranted?: number;
    aiTokensPurchased?: number;
    aiTokensUsed?: number;
    aiTokensResetDate?: string | null;
  } | undefined;

  const aiTokensResetDate =
    typeof profileData?.aiTokensResetDate === "string" && profileData.aiTokensResetDate.trim().length > 0
      ? profileData.aiTokensResetDate
      : getDefaultAiTokensResetDate();

  return {
    quizzesCompleted: typeof profileData?.quizzesCompleted === "number" ? profileData.quizzesCompleted : 0,
    quizzesCreatedPublished:
      typeof profileData?.quizzesCreatedPublished === "number" ? profileData.quizzesCreatedPublished : 0,
    quizzesPlayedTotal: typeof profileData?.quizzesPlayedTotal === "number" ? profileData.quizzesPlayedTotal : 0,
    playStreakDays: typeof profileData?.playStreakDays === "number" ? profileData.playStreakDays : 0,
    perfectQuizzesCompleted:
      typeof profileData?.perfectQuizzesCompleted === "number" ? profileData.perfectQuizzesCompleted : 0,
    lastCompletedQuizDate:
      typeof profileData?.lastCompletedQuizDate === "string" && profileData.lastCompletedQuizDate.trim().length > 0
        ? profileData.lastCompletedQuizDate
        : null,
    triggeredEventKeys: normalizeStringArray(profileData?.triggeredEventKeys),
    earnedTierByBadgeId: Object.fromEntries(
      Object.entries(profileData?.earnedTierByBadgeId ?? {}).flatMap(([badgeId, tier]) => {
        const tierNumber = typeof tier === "number" ? tier : Number(tier);
        return Number.isFinite(tierNumber) && tierNumber > 0 ? [[badgeId, tierNumber]] : [];
      })
    ),
    earnedDiscoveryBadgeIds: normalizeStringArray(profileData?.earnedDiscoveryBadgeIds),
    firstDiscoverySeen: profileData?.firstDiscoverySeen ?? false,
    firstDiscoveryProfileLabelSeen: profileData?.firstDiscoveryProfileLabelSeen ?? false,
    aiTokens: normalizeTokenNumber(profileData?.aiTokens),
    aiTokensGranted: normalizeTokenNumber(profileData?.aiTokensGranted),
    aiTokensPurchased: normalizeTokenNumber(profileData?.aiTokensPurchased),
    aiTokensUsed: normalizeTokenNumber(profileData?.aiTokensUsed),
    aiTokensResetDate,
  };
}

export async function savePlayerBadgeProgress(progress: PlayerBadgeProgressSnapshot): Promise<void> {
  const { db } = getFirebaseServices();
  const uid = await getCurrentAuthUid();
  await setDoc(
    doc(db, "playerProfiles", uid),
    {
      quizzesCompleted: progress.quizzesCompleted,
      quizzesCreatedPublished: progress.quizzesCreatedPublished,
      quizzesPlayedTotal: progress.quizzesPlayedTotal,
      playStreakDays: progress.playStreakDays,
      perfectQuizzesCompleted: progress.perfectQuizzesCompleted,
      lastCompletedQuizDate: progress.lastCompletedQuizDate,
      triggeredEventKeys: [...new Set(progress.triggeredEventKeys)],
      earnedTierByBadgeId: progress.earnedTierByBadgeId,
      earnedDiscoveryBadgeIds: [...new Set(progress.earnedDiscoveryBadgeIds)],
      firstDiscoverySeen: progress.firstDiscoverySeen,
      firstDiscoveryProfileLabelSeen: progress.firstDiscoveryProfileLabelSeen,
      aiTokens: normalizeTokenNumber(progress.aiTokens),
      aiTokensGranted: normalizeTokenNumber(progress.aiTokensGranted),
      aiTokensPurchased: normalizeTokenNumber(progress.aiTokensPurchased),
      aiTokensUsed: normalizeTokenNumber(progress.aiTokensUsed),
      aiTokensResetDate: progress.aiTokensResetDate ?? getDefaultAiTokensResetDate(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function getCurrentUserTokens(): Promise<UserTokens> {
  const progress = await getPlayerBadgeProgress();
  return {
    aiTokens: progress.aiTokens,
    aiTokensGranted: progress.aiTokensGranted,
    aiTokensPurchased: progress.aiTokensPurchased,
    aiTokensUsed: progress.aiTokensUsed,
    aiTokensResetDate: progress.aiTokensResetDate,
  };
}

export async function seedAiAdminPreviewTokens(seedValue = 9999): Promise<UserTokens> {
  const progress = await getPlayerBadgeProgress();
  const nextTokens = Math.max(progress.aiTokens, seedValue);
  const nextGranted = Math.max(progress.aiTokensGranted, seedValue);

  if (nextTokens !== progress.aiTokens || nextGranted !== progress.aiTokensGranted) {
    await savePlayerBadgeProgress({
      ...progress,
      aiTokens: nextTokens,
      aiTokensGranted: nextGranted,
      aiTokensResetDate: progress.aiTokensResetDate ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
  }

  return {
    aiTokens: nextTokens,
    aiTokensGranted: nextGranted,
    aiTokensPurchased: progress.aiTokensPurchased,
    aiTokensUsed: progress.aiTokensUsed,
    aiTokensResetDate: progress.aiTokensResetDate ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

export async function consumeAiToken(): Promise<AiTokenConsumeResult> {
  const { db } = getFirebaseServices();
  const uid = await getCurrentAuthUid();
  const profileRef = doc(db, "playerProfiles", uid);

  return runTransaction(db, async (transaction) => {
    const profileSnapshot = await transaction.get(profileRef);
    const profileData = (profileSnapshot.data() as {
      aiTokens?: unknown;
      aiTokensUsed?: unknown;
      aiTokensResetDate?: unknown;
    } | undefined) ?? {};

    const currentTokens = normalizeTokenNumber(profileData.aiTokens);
    const currentUsed = normalizeTokenNumber(profileData.aiTokensUsed);
    const nextResetDate =
      typeof profileData.aiTokensResetDate === "string" && profileData.aiTokensResetDate.trim().length > 0
        ? profileData.aiTokensResetDate
        : getDefaultAiTokensResetDate();

    if (currentTokens < 1) {
      const tokenError = new Error("No tokens remaining") as Error & { code?: string };
      tokenError.code = "no-ai-tokens";
      throw tokenError;
    }

    const nextTokens = currentTokens - 1;
    const nextUsed = currentUsed + 1;
    transaction.set(
      profileRef,
      {
        aiTokens: nextTokens,
        aiTokensUsed: nextUsed,
        aiTokensResetDate: nextResetDate,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    return {
      aiTokens: nextTokens,
      aiTokensUsed: nextUsed,
    };
  });
}

export async function storePlayerBadgeUnlocks(events: BadgeUnlockEvent[]): Promise<void> {
  if (events.length === 0) return;

  const { db } = getFirebaseServices();
  const uid = await getCurrentAuthUid();
  const progress = await getPlayerBadgeProgress();

  await Promise.all(
    events.map((event) =>
      setDoc(
        doc(db, "playerProfiles", uid, "earnedBadges", buildBadgeUnlockId(event)),
        {
          badgeId: event.badgeId,
          type: event.type,
          tier: event.tier,
          xpReward: event.xpReward,
          displayName: event.displayName,
          flavourText: event.flavourText,
          imageKey: event.imageKey,
          earnedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
    )
  );

  const nextProgress: PlayerBadgeProgressSnapshot = {
    ...progress,
    firstDiscoverySeen: progress.firstDiscoverySeen,
    firstDiscoveryProfileLabelSeen: progress.firstDiscoveryProfileLabelSeen,
    earnedTierByBadgeId: {
      ...progress.earnedTierByBadgeId,
      ...Object.fromEntries(
        events
          .filter((event) => event.type === "tiered" && event.tier !== null)
          .map((event) => [event.badgeId, event.tier as number])
      ),
    },
    earnedDiscoveryBadgeIds: [
      ...new Set([
        ...progress.earnedDiscoveryBadgeIds,
        ...events.filter((event) => event.type === "discovery").map((event) => event.badgeId),
      ]),
    ],
  };

  await savePlayerBadgeProgress(nextProgress);
}

export async function markFirstDiscoverySeen(): Promise<void> {
  const progress = await getPlayerBadgeProgress();
  if (progress.firstDiscoverySeen) return;
  await savePlayerBadgeProgress({
    ...progress,
    firstDiscoverySeen: true,
  });
}

export async function markFirstDiscoveryProfileLabelSeen(): Promise<void> {
  const progress = await getPlayerBadgeProgress();
  if (progress.firstDiscoveryProfileLabelSeen) return;
  await savePlayerBadgeProgress({
    ...progress,
    firstDiscoveryProfileLabelSeen: true,
  });
}

export async function getPlayerEarnedBadges(): Promise<PlayerEarnedBadge[]> {
  const { db } = getFirebaseServices();
  const uid = await getCurrentAuthUid();
  const badgesSnapshot = await getDocs(
    query(collection(db, `playerProfiles/${uid}/earnedBadges`), orderBy("earnedAt", "desc"))
  );

  return badgesSnapshot.docs.map((badgeDoc) => {
    const data = badgeDoc.data() as {
      badgeId?: string;
      type?: "tiered" | "discovery";
      tier?: number | null;
      xpReward?: number;
      imageKey?: string | null;
      earnedAt?: unknown;
    };

    return {
      id: badgeDoc.id,
      badgeId: data.badgeId ?? "",
      type: data.type ?? "tiered",
      tier: typeof data.tier === "number" ? data.tier : null,
      xpReward: typeof data.xpReward === "number" ? data.xpReward : 0,
      imageKey: typeof data.imageKey === "string" ? data.imageKey : null,
      earnedAt: toIsoOrNull(data.earnedAt),
    };
  });
}

export interface CreatedQuiz {
  quizId: string;
  editKey: string;
}

export interface EditableQuizDraft {
  quizId: string;
  input: QuizDraftInput;
  status: "draft" | "published";
}

export interface PublishedQuizDiscoveryItem {
  id: string;
  title: string;
  description: string;
  status: "published";
  waypointCount: number;
  questionCount: number;
  routeDistanceKm: number;
  createdAt: string | null;
  updatedAt: string | null;
  waypointCoordinates: Coordinates[];
}

export interface PlayerFavoriteQuizItem {
  quizId: string;
  favoritedAt: string | null;
}

export interface PlayerQuizHistoryItem {
  sessionId: string;
  quizId: string;
  status: "active" | "completed";
  score: number;
  startedAt: string | null;
  completedAt: string | null;
}

export interface AccessCodeAvailabilityResult {
  available: boolean;
  suggestion?: string;
}

export interface PlayValueResolution {
  quizId: string;
  resolvedBy: "id" | "access_code";
}

const AUTO_ACCESS_CODE_LENGTH = 20;
const CUSTOM_CODE_REGEX = /^[A-Za-z0-9-]{4,20}$/;
const AUTO_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

function randomKey(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function randomCode(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let result = "";
  for (let i = 0; i < length; i += 1) {
    result += AUTO_CODE_ALPHABET[bytes[i] % AUTO_CODE_ALPHABET.length];
  }
  return result;
}

export function generateAutoAccessCodePreview(): string {
  return randomCode(AUTO_ACCESS_CODE_LENGTH);
}

function suggestCustomCodeVariant(code: string): string {
  const trimmed = code.trim();
  if (trimmed.length === 0) return "quiz-2";
  const normalizedDash = trimmed.replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  const withoutSuffix = normalizedDash.replace(/-\d+$/, "");
  const base = (withoutSuffix || normalizedDash || "quiz").slice(0, 18);
  return `${base}-2`;
}

export function normalizeAccessCode(code: string): string {
  return code.trim().toLowerCase();
}

export function isCustomAccessCodeFormatValid(code: string): boolean {
  return CUSTOM_CODE_REGEX.test(code.trim());
}

function isQuizValidAt(quizSummary: Pick<QuizSummary, "closeAt">): boolean {
  return Date.parse(quizSummary.closeAt) > Date.now();
}

function isPublicWithLegacyDefault(status: "draft" | "published", isPublic: boolean | null | undefined): boolean {
  return isPublic ?? status === "published";
}

function toIsoOrNull(value: unknown): string | null {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  if (value && typeof value === "object" && "toDate" in (value as Record<string, unknown>)) {
    try {
      const date = (value as { toDate: () => Date }).toDate();
      return date.toISOString();
    } catch {
      return null;
    }
  }

  return null;
}

function normalizeRouteLegCoordinates(value: unknown): Array<Array<{ lat: number; lng: number }>> {
  if (!Array.isArray(value)) return [];

  return value.map((leg) => {
    if (!Array.isArray(leg)) return [];
    return leg
      .map((point) => {
        if (!point || typeof point !== "object") return null;
        const lat = (point as { lat?: unknown }).lat;
        const lng = (point as { lng?: unknown }).lng;
        if (typeof lat !== "number" || typeof lng !== "number") return null;
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return { lat, lng };
      })
      .filter((point): point is { lat: number; lng: number } => point !== null);
  });
}

export function buildPlayShareLink(quizId: string): string {
  return `${window.location.origin}/play/${quizId}`;
}

async function clearQuizAccessCode(quizId: string): Promise<void> {
  const { db } = getFirebaseServices();
  await runTransaction(db, async (transaction) => {
    const quizRef = doc(db, "quizzes", quizId);
    const quizSnapshot = await transaction.get(quizRef);
    if (!quizSnapshot.exists()) {
      throw new Error("Quiz not found");
    }

    const quizData = quizSnapshot.data() as { accessCodeNormalized?: string | null };
    const previousNormalized =
      typeof quizData.accessCodeNormalized === "string" && quizData.accessCodeNormalized.length > 0
        ? quizData.accessCodeNormalized
        : null;

    if (previousNormalized) {
      transaction.delete(doc(db, "quizAccessCodes", previousNormalized));
    }

    transaction.update(quizRef, {
      accessCode: null,
      accessCodeNormalized: null,
      updatedAt: serverTimestamp(),
    });
  });
}

async function claimAccessCodeForQuiz(params: {
  quizId: string;
  code: string;
  isAutoGenerated: boolean;
}): Promise<{ code: string; normalized: string }> {
  const { db } = getFirebaseServices();
  const code = params.code.trim();
  const normalized = normalizeAccessCode(code);

  await runTransaction(db, async (transaction) => {
    const quizRef = doc(db, "quizzes", params.quizId);
    const quizSnapshot = await transaction.get(quizRef);
    if (!quizSnapshot.exists()) {
      throw new Error("Quiz not found");
    }

    const quizData = quizSnapshot.data() as {
      accessCodeNormalized?: string | null;
    };
    const previousNormalized =
      typeof quizData.accessCodeNormalized === "string" && quizData.accessCodeNormalized.length > 0
        ? quizData.accessCodeNormalized
        : null;

    const registryRef = doc(db, "quizAccessCodes", normalized);
    const registrySnapshot = await transaction.get(registryRef);
    if (registrySnapshot.exists()) {
      const takenByQuizId = String((registrySnapshot.data() as { quizId?: string }).quizId ?? "");
      if (takenByQuizId !== params.quizId) {
        const takenError = new Error("Access code already in use") as Error & { code?: string };
        takenError.code = "access-code-taken";
        throw takenError;
      }
    }

    if (previousNormalized && previousNormalized !== normalized) {
      transaction.delete(doc(db, "quizAccessCodes", previousNormalized));
    }

    transaction.set(registryRef, {
      quizId: params.quizId,
      code,
      codeNormalized: normalized,
      isAutoGenerated: params.isAutoGenerated,
      updatedAt: serverTimestamp(),
    });

    transaction.update(quizRef, {
      accessCode: code,
      accessCodeNormalized: normalized,
      updatedAt: serverTimestamp(),
    });
  });

  return { code, normalized };
}

async function generateAndClaimAutoAccessCode(quizId: string): Promise<{ code: string; normalized: string }> {
  let lastError: unknown = null;
  for (let i = 0; i < 20; i += 1) {
    const generated = randomCode(AUTO_ACCESS_CODE_LENGTH);
    try {
      return await claimAccessCodeForQuiz({
        quizId,
        code: generated,
        isAutoGenerated: true,
      });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code !== "access-code-taken") {
        throw error;
      }
      lastError = error;
    }
  }

  throw (lastError instanceof Error ? lastError : new Error("Failed to generate a unique access code"));
}

export async function checkAccessCodeAvailability(code: string, currentQuizId?: string): Promise<AccessCodeAvailabilityResult> {
  const { db } = getFirebaseServices();
  const trimmed = code.trim();
  if (!isCustomAccessCodeFormatValid(trimmed)) {
    return { available: false };
  }

  const normalized = normalizeAccessCode(trimmed);
  const snapshot = await getDoc(doc(db, "quizAccessCodes", normalized));
  if (!snapshot.exists()) {
    return { available: true };
  }

  const takenQuizId = String((snapshot.data() as { quizId?: string }).quizId ?? "").trim();
  if (currentQuizId && takenQuizId === currentQuizId) {
    return { available: true };
  }

  return {
    available: false,
    suggestion: suggestCustomCodeVariant(trimmed),
  };
}

export async function setQuizCustomAccessCode(quizId: string, code: string): Promise<string> {
  await assertQuizOwnership(quizId);
  const trimmed = code.trim();
  if (!isCustomAccessCodeFormatValid(trimmed)) {
    throw new Error("Access code must be 4-20 characters using letters, numbers, or hyphens");
  }

  const claimed = await claimAccessCodeForQuiz({
    quizId,
    code: trimmed,
    isAutoGenerated: false,
  });
  return claimed.code;
}

export async function regenerateQuizAccessCode(quizId: string): Promise<string> {
  const { db } = getFirebaseServices();
  await assertQuizOwnership(quizId);
  const summary = await getQuizSummary(quizId);
  if (!summary) {
    throw new Error("Quiz not found");
  }
  if (!isQuizValidAt(summary)) {
    throw new Error("Quiz has expired");
  }

  const claimed = await generateAndClaimAutoAccessCode(quizId);
  await updateDoc(doc(db, "quizzes", quizId), {
    isPublic: false,
    accessCode: claimed.code,
    accessCodeNormalized: claimed.normalized,
    updatedAt: serverTimestamp(),
  });
  return claimed.code;
}

export async function resolvePlayableQuizId(value: string): Promise<PlayValueResolution | null> {
  const { db } = getFirebaseServices();
  const candidate = value.trim();
  if (candidate.length === 0) {
    return null;
  }

  const directQuiz = await getDoc(doc(db, "quizzes", candidate));
  if (directQuiz.exists()) {
    return { quizId: candidate, resolvedBy: "id" };
  }

  const normalized = normalizeAccessCode(candidate);
  const codeSnapshot = await getDoc(doc(db, "quizAccessCodes", normalized));
  if (!codeSnapshot.exists()) {
    return null;
  }

  const resolvedQuizId = String((codeSnapshot.data() as { quizId?: string }).quizId ?? "").trim();
  if (!resolvedQuizId) {
    return null;
  }

  const summary = await getQuizSummary(resolvedQuizId);
  if (!summary) {
    return null;
  }
  if (summary.status !== "published") {
    return null;
  }
  if (!isQuizValidAt(summary)) {
    return null;
  }
  if (normalizeAccessCode(summary.accessCode ?? "") !== normalized) {
    return null;
  }

  return { quizId: resolvedQuizId, resolvedBy: "access_code" };
}

async function assertQuizOwnership(quizId: string): Promise<void> {
  const { db } = getFirebaseServices();
  const uid = await getCurrentAuthUid();
  const snapshot = await getDoc(doc(db, "quizzes", quizId));
  if (!snapshot.exists()) {
    throw new Error("Quiz not found");
  }

  const data = snapshot.data() as { creatorUid?: string };
  if (!data.creatorUid || data.creatorUid !== uid) {
    throw new Error("You do not have permission to edit this quiz");
  }
}

function fromQuestionDoc(questionData: {
  questionType?: QuestionType;
  text?: string;
  choices?: Array<{ id: string; text: string }>;
  correctChoiceIds?: string[];
  correctChoiceId?: string | null;
  numericAnswer?: number | null;
  numericTolerance?: number | null;
  letterOrderAnswer?: string | null;
  funFact?: string | null;
  sourceUrl?: string | null;
  timerSeconds?: number | null;
}): QuizDraftInput["waypoints"][number]["questions"][number] {
  const normalizedChoices = (questionData.choices ?? []).map((choice) => choice.text ?? "");
  const effectiveCorrectIds =
    Array.isArray(questionData.correctChoiceIds) && questionData.correctChoiceIds.length > 0
      ? questionData.correctChoiceIds
      : questionData.correctChoiceId
        ? [questionData.correctChoiceId]
        : [];

  const correctChoiceIndexes = effectiveCorrectIds
    .map((correctId) => (questionData.choices ?? []).findIndex((choice) => choice.id === correctId))
    .filter((index) => index >= 0);

  return {
    questionType: questionData.questionType ?? "multiple_choice",
    text: questionData.text ?? "",
    choices: normalizedChoices,
    correctChoiceIndexes,
    numericAnswer: questionData.numericAnswer ?? null,
    letterOrderAnswer: questionData.letterOrderAnswer ?? null,
    funFact: questionData.funFact ?? undefined,
    sourceUrl: questionData.sourceUrl ?? undefined,
    config: {
      timerSeconds: questionData.timerSeconds ?? null,
      numericTolerance: questionData.numericTolerance ?? null,
    },
  };
}

async function persistQuizWaypoints(quizId: string, waypoints: QuizDraftInput["waypoints"], replaceExisting: boolean): Promise<void> {
  const { db } = getFirebaseServices();

  if (replaceExisting) {
    const existingWaypointSnapshot = await getDocs(collection(db, `quizzes/${quizId}/waypoints`));
    for (const waypointDoc of existingWaypointSnapshot.docs) {
      const questionSnapshot = await getDocs(collection(db, `quizzes/${quizId}/waypoints/${waypointDoc.id}/questions`));
      for (const questionDoc of questionSnapshot.docs) {
        await deleteDoc(questionDoc.ref);
      }
      await deleteDoc(waypointDoc.ref);
    }
  }

  for (let i = 0; i < waypoints.length; i += 1) {
    const waypoint = waypoints[i];
    const waypointRef = doc(collection(db, `quizzes/${quizId}/waypoints`));
    await setDoc(waypointRef, {
      order: i + 1,
      title: waypoint.name,
      lat: waypoint.lat,
      lng: waypoint.lng,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    for (let qIndex = 0; qIndex < waypoint.questions.length; qIndex += 1) {
      const question = waypoint.questions[qIndex];
      const persistedChoices = question.choices
        .map((choice) => choice.trim())
        .filter((choice) => choice.length > 0);
      const choiceDocs = persistedChoices.map((choice, index) => ({ id: `c${index + 1}`, text: choice }));
      const correctChoiceIds = question.correctChoiceIndexes
        .filter((index) => Number.isInteger(index) && index >= 0 && index < choiceDocs.length)
        .map((index) => `c${index + 1}`);
      await addDoc(collection(db, `quizzes/${quizId}/waypoints/${waypointRef.id}/questions`), {
        order: qIndex + 1,
        schemaVersion: 3,
        questionType: question.questionType,
        text: question.text,
        choices: choiceDocs,
        correctChoiceIds,
        correctChoiceId: correctChoiceIds[0] ?? null,
        numericAnswer: question.numericAnswer,
        numericTolerance: question.config.numericTolerance,
        letterOrderAnswer: question.letterOrderAnswer,
        funFact: question.funFact ?? null,
        sourceUrl: question.sourceUrl ?? null,
        timerSeconds: question.config.timerSeconds,
        pointsIfCorrect: 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  }
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function createDraftQuiz(input: QuizDraftInput): Promise<CreatedQuiz> {
  const { db } = getFirebaseServices();
  const creatorUid = await getCurrentAuthUid();
  const editKey = randomKey();
  const editKeyHash = await sha256Hex(editKey);
  const wantsPublic = input.isPublic;
  const quizRef = await addDoc(collection(db, "quizzes"), {
    title: input.title,
    description: input.description,
    isPublic: wantsPublic,
    accessCode: null,
    accessCodeNormalized: null,
    organizerName: input.organizerName,
    organizerAvatarUrl: input.organizerAvatarUrl,
    organizerSwish: input.organizerSwish,
    isAnonymous: input.isAnonymous,
    status: "draft",
    defaultLocale: input.locale,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    waypointCount: input.waypoints.length,
    creatorUid,
  });

  await setDoc(doc(db, "quizSecrets", quizRef.id), {
    editKeyHash,
    createdAt: serverTimestamp(),
  });

  await setDoc(doc(db, "quizRules", quizRef.id), {
    rulesetVersion: 1,
    openAt: input.ruleset.openAt,
    closeAt: input.ruleset.closeAt,
    questionTimeLimitSeconds: input.ruleset.questionTimeLimitSeconds,
    interQuestionTimeLimitSeconds: input.ruleset.interQuestionTimeLimitSeconds,
    revealMode: input.ruleset.revealMode,
    revealAt: input.ruleset.revealAt,
    waypointGateRadiusMeters: input.ruleset.waypointGateRadiusMeters,
    requireSequentialWaypoints: input.ruleset.requireSequentialWaypoints,
    routeMode: input.ruleset.routeMode,
    routeLegModes: input.ruleset.routeLegModes,
    routeLegCoordinates: input.ruleset.routeLegCoordinates,
    questionOrderMode: input.ruleset.questionOrderMode,
    scoringStrategy: input.ruleset.scoringStrategy,
    winnerPolicy: "highest_score",
    updatedAt: serverTimestamp(),
  });

  if (!wantsPublic) {
    const preferredCode = input.accessCode?.trim() ?? "";
    if (preferredCode.length > 0 && isCustomAccessCodeFormatValid(preferredCode)) {
      await claimAccessCodeForQuiz({
        quizId: quizRef.id,
        code: preferredCode,
        isAutoGenerated: false,
      });
    } else {
      await generateAndClaimAutoAccessCode(quizRef.id);
    }
  }

  await persistQuizWaypoints(quizRef.id, input.waypoints, false);

  return { quizId: quizRef.id, editKey };
}

export async function getEditableQuizDraft(quizId: string): Promise<EditableQuizDraft> {
  const { db } = getFirebaseServices();

  const quizDoc = await getDoc(doc(db, "quizzes", quizId));
  const rulesDoc = await getDoc(doc(db, "quizRules", quizId));
  if (!quizDoc.exists() || !rulesDoc.exists()) {
    throw new Error("Quiz draft not found");
  }

  const quizData = quizDoc.data() as {
    title?: string;
    description?: string;
    isPublic?: boolean;
    accessCode?: string | null;
    organizerName?: string | null;
    organizerAvatarUrl?: string | null;
    organizerSwish?: string | null;
    isAnonymous?: boolean;
    defaultLocale?: "en" | "sv";
    status?: "draft" | "published";
  };
  const rulesData = rulesDoc.data() as {
    openAt?: string;
    closeAt?: string;
    questionTimeLimitSeconds?: number | null;
    interQuestionTimeLimitSeconds?: number | null;
    revealMode?: "instant" | "on_completion" | "scheduled";
    revealAt?: string | null;
    waypointGateRadiusMeters?: number;
    requireSequentialWaypoints?: boolean;
    routeMode?: RouteMode;
    routeLegModes?: RouteMode[];
    routeLegCoordinates?: unknown;
    questionOrderMode?: QuestionOrderMode;
    scoringStrategy?: "binary_correct_1_point";
  };

  const waypointSnapshot = await getDocs(query(collection(db, `quizzes/${quizId}/waypoints`), orderBy("order", "asc")));
  const waypoints = await Promise.all(
    waypointSnapshot.docs.map(async (waypointDoc) => {
      const waypointData = waypointDoc.data() as {
        title?: string;
        lat?: number;
        lng?: number;
      };
      const questionsSnapshot = await getDocs(
        query(collection(db, `quizzes/${quizId}/waypoints/${waypointDoc.id}/questions`), orderBy("order", "asc"))
      );

      return {
        name: waypointData.title ?? "Waypoint",
        lat: waypointData.lat ?? 57.7089,
        lng: waypointData.lng ?? 11.9746,
        questions: questionsSnapshot.docs.map((questionDoc) => fromQuestionDoc(questionDoc.data() as {
          questionType?: QuestionType;
          text?: string;
          choices?: Array<{ id: string; text: string }>;
          correctChoiceIds?: string[];
          correctChoiceId?: string | null;
          numericAnswer?: number | null;
          numericTolerance?: number | null;
          letterOrderAnswer?: string | null;
          funFact?: string | null;
          sourceUrl?: string | null;
          timerSeconds?: number | null;
        })),
      };
    })
  );

  return {
    quizId,
    status: quizData.status ?? "draft",
    input: {
      title: quizData.title ?? "",
      description: quizData.description ?? "",
      isPublic: quizData.isPublic ?? false,
      accessCode: quizData.accessCode ?? null,
      locale: quizData.defaultLocale ?? "en",
      organizerName: quizData.organizerName ?? null,
      organizerAvatarUrl: quizData.organizerAvatarUrl ?? null,
      organizerSwish: quizData.organizerSwish ?? null,
      isAnonymous: quizData.isAnonymous ?? false,
      waypoints,
      ruleset: {
        openAt: rulesData.openAt ?? new Date().toISOString(),
        closeAt: rulesData.closeAt ?? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        questionTimeLimitSeconds: rulesData.questionTimeLimitSeconds ?? null,
        interQuestionTimeLimitSeconds: rulesData.interQuestionTimeLimitSeconds ?? null,
        revealMode: rulesData.revealMode ?? "instant",
        revealAt: rulesData.revealAt ?? null,
        waypointGateRadiusMeters: rulesData.waypointGateRadiusMeters ?? 40,
        requireSequentialWaypoints: rulesData.requireSequentialWaypoints ?? true,
        routeMode: rulesData.routeMode ?? "crow",
        routeLegModes: rulesData.routeLegModes ?? [],
        routeLegCoordinates: normalizeRouteLegCoordinates(rulesData.routeLegCoordinates),
        questionOrderMode: rulesData.questionOrderMode ?? "fixed",
        scoringStrategy: rulesData.scoringStrategy ?? "binary_correct_1_point",
      },
    },
  };
}

export async function updateQuizDraft(quizId: string, input: QuizDraftInput): Promise<void> {
  const { db } = getFirebaseServices();
  await assertQuizOwnership(quizId);

  const quizDoc = await getDoc(doc(db, "quizzes", quizId));
  if (!quizDoc.exists()) {
    throw new Error("Quiz not found");
  }
  await updateDoc(doc(db, "quizzes", quizId), {
    title: input.title,
    description: input.description,
    isPublic: input.isPublic,
    organizerName: input.organizerName,
    organizerAvatarUrl: input.organizerAvatarUrl,
    organizerSwish: input.organizerSwish,
    isAnonymous: input.isAnonymous,
    defaultLocale: input.locale,
    waypointCount: input.waypoints.length,
    updatedAt: serverTimestamp(),
  });

  if (input.isPublic) {
    await clearQuizAccessCode(quizId);
  } else {
    const existingSummary = await getQuizSummary(quizId);
    const preferredCode = input.accessCode?.trim() ?? "";

    if (preferredCode.length > 0 && isCustomAccessCodeFormatValid(preferredCode)) {
      await claimAccessCodeForQuiz({
        quizId,
        code: preferredCode,
        isAutoGenerated: false,
      });
    } else if (!existingSummary?.accessCode) {
      await generateAndClaimAutoAccessCode(quizId);
    }
  }

  await setDoc(doc(db, "quizRules", quizId), {
    rulesetVersion: 1,
    openAt: input.ruleset.openAt,
    closeAt: input.ruleset.closeAt,
    questionTimeLimitSeconds: input.ruleset.questionTimeLimitSeconds,
    interQuestionTimeLimitSeconds: input.ruleset.interQuestionTimeLimitSeconds,
    revealMode: input.ruleset.revealMode,
    revealAt: input.ruleset.revealAt,
    waypointGateRadiusMeters: input.ruleset.waypointGateRadiusMeters,
    requireSequentialWaypoints: input.ruleset.requireSequentialWaypoints,
    routeMode: input.ruleset.routeMode,
    routeLegModes: input.ruleset.routeLegModes,
    routeLegCoordinates: input.ruleset.routeLegCoordinates,
    questionOrderMode: input.ruleset.questionOrderMode,
    scoringStrategy: input.ruleset.scoringStrategy,
    winnerPolicy: "highest_score",
    updatedAt: serverTimestamp(),
  }, { merge: true });

  await persistQuizWaypoints(quizId, input.waypoints, true);
}

export async function getUserQuizzes(): Promise<QuizListItem[]> {
  const { db } = getFirebaseServices();
  const creatorUid = await getCurrentAuthUid();
  const quizzesQuery = query(collection(db, "quizzes"), where("creatorUid", "==", creatorUid));
  const snapshot = await getDocs(quizzesQuery);

  const quizzes = await Promise.all(snapshot.docs.map(async (quizDoc) => {
    const data = quizDoc.data() as {
      title?: string;
      description?: string;
      status?: "draft" | "published";
      isPublic?: boolean;
      accessCode?: string | null;
      waypointCount?: number;
      createdAt?: unknown;
      updatedAt?: unknown;
    };

    let validUntil: string | null = null;
    try {
      const rulesDoc = await getDoc(doc(db, "quizRules", quizDoc.id));
      if (rulesDoc.exists()) {
        const rulesData = rulesDoc.data() as { closeAt?: string };
        validUntil = rulesData.closeAt ?? null;
      }
    } catch {
      validUntil = null;
    }

    let routeDistanceKm: number;
    try {
      const waypointSnapshot = await getDocs(
        query(collection(db, `quizzes/${quizDoc.id}/waypoints`), orderBy("order", "asc"))
      );
      const points = waypointSnapshot.docs
        .map((waypointDoc) => {
          const waypointData = waypointDoc.data() as { lat?: number; lng?: number };
          if (typeof waypointData.lat !== "number" || typeof waypointData.lng !== "number") return null;
          return { lat: waypointData.lat, lng: waypointData.lng };
        })
        .filter((point): point is { lat: number; lng: number } => point !== null);
      routeDistanceKm = routeDistanceMeters(points) / 1000;
    } catch {
      routeDistanceKm = 0;
    }

    return {
      id: quizDoc.id,
      title: data.title ?? "Untitled quiz",
      description: data.description ?? "",
      status: data.status ?? "draft",
      isPublic: isPublicWithLegacyDefault(data.status ?? "draft", data.isPublic),
      accessCode: data.accessCode ?? null,
      validUntil,
      waypointCount: data.waypointCount ?? 0,
      routeDistanceKm,
      createdAt: toIsoOrNull(data.createdAt),
      updatedAt: toIsoOrNull(data.updatedAt),
    };
  }));

  return quizzes.sort((a, b) => {
    const aTime = a.updatedAt ? Date.parse(a.updatedAt) : 0;
    const bTime = b.updatedAt ? Date.parse(b.updatedAt) : 0;
    return bTime - aTime;
  });
}

export async function getAllQuizzes(): Promise<QuizListItem[]> {
  const { db } = getFirebaseServices();
  const snapshot = await getDocs(collection(db, "quizzes"));

  const quizzes: QuizListItem[] = snapshot.docs.map((quizDoc) => {
    const data = quizDoc.data() as {
      title?: string;
      description?: string;
      status?: "draft" | "published";
      isPublic?: boolean;
      accessCode?: string | null;
      waypointCount?: number;
      createdAt?: unknown;
      updatedAt?: unknown;
    };
    return {
      id: quizDoc.id,
      title: data.title ?? "Untitled quiz",
      description: data.description ?? "",
      status: data.status ?? "draft",
      isPublic: data.isPublic ?? false,
      accessCode: data.accessCode ?? null,
      validUntil: null,
      waypointCount: data.waypointCount ?? 0,
      routeDistanceKm: 0,
      createdAt: toIsoOrNull(data.createdAt),
      updatedAt: toIsoOrNull(data.updatedAt),
    };
  });

  return quizzes.sort((a, b) => {
    const aTime = a.updatedAt ? Date.parse(a.updatedAt) : 0;
    const bTime = b.updatedAt ? Date.parse(b.updatedAt) : 0;
    return bTime - aTime;
  });
}

export async function getCreatorTotalCompletedPlays(): Promise<number> {
  const { db } = getFirebaseServices();
  const creatorUid = await getCurrentAuthUid();
  const quizzesSnapshot = await getDocs(query(collection(db, "quizzes"), where("creatorUid", "==", creatorUid)));
  if (quizzesSnapshot.empty) return 0;

  const sessionSnapshots = await Promise.all(
    quizzesSnapshot.docs.map((quizDoc) =>
      getDocs(
        query(
          collection(db, "participantSessions"),
          where("quizId", "==", quizDoc.id),
          where("status", "==", "completed")
        )
      ).catch(() => null)
    )
  );

  return sessionSnapshots.reduce((sum, snapshot) => {
    if (!snapshot) return sum;
    const otherPlayersCount = snapshot.docs.filter((sessionDoc) => {
      const data = sessionDoc.data() as { anonymousUid?: string };
      return typeof data.anonymousUid === "string" && data.anonymousUid !== creatorUid;
    }).length;
    return sum + otherPlayersCount;
  }, 0);
}

async function loadQuizDiscoveryItem(quizDoc: { id: string; data: () => unknown }): Promise<PublishedQuizDiscoveryItem> {
  const { db } = getFirebaseServices();
  const data = quizDoc.data() as {
    title?: string;
    description?: string;
    status?: "draft" | "published";
    isPublic?: boolean;
    createdAt?: unknown;
    updatedAt?: unknown;
  };

  if (!isPublicWithLegacyDefault(data.status ?? "draft", data.isPublic)) {
    throw new Error("Quiz is private");
  }

  const rulesDoc = await getDoc(doc(db, "quizRules", quizDoc.id));
  if (!rulesDoc.exists()) {
    throw new Error("Quiz rules missing");
  }
  const rulesData = rulesDoc.data() as { closeAt?: string };
  const validUntil = rulesData.closeAt ?? null;
  if (!validUntil || Date.parse(validUntil) <= Date.now()) {
    throw new Error("Quiz expired");
  }

  const waypointSnapshot = await getDocs(
    query(collection(db, `quizzes/${quizDoc.id}/waypoints`), orderBy("order", "asc"))
  );

  const waypointCoordinates: Coordinates[] = [];
  let questionCount = 0;
  for (const waypointDoc of waypointSnapshot.docs) {
    const waypointData = waypointDoc.data() as { lat?: number; lng?: number };
    if (typeof waypointData.lat === "number" && typeof waypointData.lng === "number") {
      waypointCoordinates.push({ lat: waypointData.lat, lng: waypointData.lng });
    }

    const questionSnapshot = await getDocs(collection(db, `quizzes/${quizDoc.id}/waypoints/${waypointDoc.id}/questions`));
    questionCount += questionSnapshot.size;
  }

  return {
    id: quizDoc.id,
    title: data.title ?? "Untitled quiz",
    description: data.description ?? "",
    status: "published",
    waypointCount: waypointSnapshot.size,
    questionCount,
    routeDistanceKm: routeDistanceMeters(waypointCoordinates) / 1000,
    createdAt: toIsoOrNull(data.createdAt),
    updatedAt: toIsoOrNull(data.updatedAt),
    waypointCoordinates,
  };
}

export async function getPublishedQuizDiscoveryItems(): Promise<PublishedQuizDiscoveryItem[]> {
  const { db } = getFirebaseServices();
  const quizzesQuery = query(collection(db, "quizzes"), where("status", "==", "published"));
  const snapshot = await getDocs(quizzesQuery);

  const quizzes = (
    await Promise.all(
      snapshot.docs.map(async (quizDoc) => {
        try {
          return await loadQuizDiscoveryItem(quizDoc);
        } catch {
          return null;
        }
      })
    )
  ).filter((quiz): quiz is PublishedQuizDiscoveryItem => quiz !== null);
  return quizzes.sort((a, b) => {
    const aTime = a.updatedAt ? Date.parse(a.updatedAt) : 0;
    const bTime = b.updatedAt ? Date.parse(b.updatedAt) : 0;
    return bTime - aTime;
  });
}

export async function getPlayerFavoriteQuizzes(): Promise<PlayerFavoriteQuizItem[]> {
  const { db } = getFirebaseServices();
  const uid = await getCurrentAuthUid();
  const snapshot = await getDocs(
    query(collection(db, `playerProfiles/${uid}/favoriteQuizzes`), orderBy("favoritedAt", "desc"))
  );

  return snapshot.docs.map((favoriteDoc) => {
    const data = favoriteDoc.data() as {
      quizId?: string;
      favoritedAt?: unknown;
    };

    return {
      quizId: data.quizId ?? favoriteDoc.id,
      favoritedAt: toIsoOrNull(data.favoritedAt),
    };
  });
}

export async function setPlayerQuizFavorite(quizId: string, favorited: boolean): Promise<void> {
  const { db } = getFirebaseServices();
  const uid = await getCurrentAuthUid();
  const favoriteRef = doc(db, "playerProfiles", uid, "favoriteQuizzes", quizId);

  if (!favorited) {
    await deleteDoc(favoriteRef);
    return;
  }

  await setDoc(
    favoriteRef,
    {
      quizId,
      favoritedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function getPlayerQuizHistory(): Promise<PlayerQuizHistoryItem[]> {
  const { db } = getFirebaseServices();
  const uid = await getCurrentAuthUid();
  const snapshot = await getDocs(query(collection(db, "participantSessions"), where("anonymousUid", "==", uid)));

  const latestByQuiz = new Map<string, PlayerQuizHistoryItem & { sortTime: number }>();

  snapshot.docs.forEach((sessionDoc) => {
    const data = sessionDoc.data() as {
      quizId?: string;
      status?: "active" | "completed";
      score?: number;
      startedAt?: unknown;
      completedAt?: unknown;
    };

    const quizId = data.quizId;
    if (typeof quizId !== "string" || quizId.trim().length === 0) {
      return;
    }

    const startedAt = toIsoOrNull(data.startedAt);
    const completedAt = toIsoOrNull(data.completedAt);
    const sortTime = Math.max(startedAt ? Date.parse(startedAt) : 0, completedAt ? Date.parse(completedAt) : 0);

    const nextEntry: PlayerQuizHistoryItem & { sortTime: number } = {
      sessionId: sessionDoc.id,
      quizId,
      status: data.status === "completed" ? "completed" : "active",
      score: typeof data.score === "number" ? data.score : 0,
      startedAt,
      completedAt,
      sortTime,
    };

    const current = latestByQuiz.get(quizId);
    if (!current || nextEntry.sortTime >= current.sortTime) {
      latestByQuiz.set(quizId, nextEntry);
    }
  });

  return [...latestByQuiz.values()]
    .sort((a, b) => b.sortTime - a.sortTime)
    .map((entry) => ({
      sessionId: entry.sessionId,
      quizId: entry.quizId,
      status: entry.status,
      score: entry.score,
      startedAt: entry.startedAt,
      completedAt: entry.completedAt,
    }));
}

export async function getQuizLeaderboard(quizId: string, maxEntries = 25): Promise<LeaderboardEntry[]> {
  const { db } = getFirebaseServices();
  const leaderboardQuery = query(
    collection(db, "participantSessions"),
    where("quizId", "==", quizId),
    where("status", "==", "completed"),
    orderBy("score", "desc"),
    orderBy("completedAt", "asc"),
    limit(maxEntries)
  );
  const snapshot = await getDocs(leaderboardQuery);

  return snapshot.docs.map((sessionDoc) => {
    const data = sessionDoc.data() as {
      nickname?: string;
      score?: number;
      completedAt?: unknown;
    };

    return {
      id: sessionDoc.id,
      nickname: data.nickname ?? "Anonymous",
      score: data.score ?? 0,
      completedAt: toIsoOrNull(data.completedAt),
    };
  });
}

export async function publishQuiz(quizId: string, _editKey: string): Promise<void> {
  void _editKey;
  const { db } = getFirebaseServices();
  await assertQuizOwnership(quizId);
  const uid = await getCurrentAuthUid();

  const quizDoc = await getDoc(doc(db, "quizzes", quizId));
  if (!quizDoc.exists()) {
    throw new Error("Quiz not found");
  }

  const data = quizDoc.data() as { status?: "draft" | "published" };
  if ((data.status ?? "draft") === "published") {
    return;
  }

  // Publish directly from the client for the authenticated creator.
  // The edit key is still retained in-session for the creator UI, but Spark-plan
  // projects cannot deploy the callable function path that used to handle publish.
  await updateDoc(doc(db, "quizzes", quizId), {
    status: "published",
    isPublic: (data as { isPublic?: boolean }).isPublic ?? false,
    publishedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const publishedCountSnapshot = await getCountFromServer(
    query(
      collection(db, "quizzes"),
      where("creatorUid", "==", uid),
      where("status", "==", "published")
    )
  );
  const publishedCount = publishedCountSnapshot.data().count;
  const progress = await getPlayerBadgeProgress();
  await savePlayerBadgeProgress({
    ...progress,
    quizzesCreatedPublished: Math.max(progress.quizzesCreatedPublished, publishedCount),
    quizzesPlayedTotal: progress.quizzesPlayedTotal,
  });
}

export async function getQuizSummary(quizId: string): Promise<QuizSummary | null> {
  const { db } = getFirebaseServices();
  const quizDoc = await getDoc(doc(db, "quizzes", quizId));
  const rulesDoc = await getDoc(doc(db, "quizRules", quizId));
  if (!quizDoc.exists() || !rulesDoc.exists()) {
    return null;
  }

  const q = quizDoc.data() as {
    title: string;
    description: string;
    status: "draft" | "published";
    isPublic?: boolean;
    accessCode?: string | null;
    creatorUid?: string;
    organizerName?: string | null;
    organizerAvatarUrl?: string | null;
    organizerSwish?: string | null;
    isAnonymous?: boolean;
  };
  const r = rulesDoc.data() as {
    openAt: string;
    closeAt: string;
    questionTimeLimitSeconds: number | null;
    interQuestionTimeLimitSeconds: number | null;
    revealMode: "instant" | "on_completion" | "scheduled";
    revealAt: string | null;
    waypointGateRadiusMeters?: number;
    requireSequentialWaypoints?: boolean;
    routeMode?: RouteMode;
    questionOrderMode?: QuestionOrderMode;
  };

  return {
    id: quizId,
    title: q.title,
    description: q.description,
    status: q.status,
    isPublic: isPublicWithLegacyDefault(q.status, q.isPublic),
    accessCode: q.accessCode ?? null,
    validUntil: r.closeAt,
    creatorUid: q.creatorUid,
    organizerName: q.organizerName ?? null,
    organizerAvatarUrl: q.organizerAvatarUrl ?? null,
    organizerSwish: q.organizerSwish ?? null,
    isAnonymous: q.isAnonymous ?? false,
    openAt: r.openAt,
    closeAt: r.closeAt,
    questionTimeLimitSeconds: r.questionTimeLimitSeconds ?? null,
    interQuestionTimeLimitSeconds: r.interQuestionTimeLimitSeconds ?? null,
    revealMode: r.revealMode ?? "instant",
    revealAt: r.revealAt ?? null,
    waypointGateRadiusMeters: r.waypointGateRadiusMeters ?? 40,
    requireSequentialWaypoints: r.requireSequentialWaypoints ?? true,
    routeMode: r.routeMode ?? "crow",
    questionOrderMode: r.questionOrderMode ?? "fixed",
  };
}

export async function getQuizWalk(quizId: string): Promise<QuizWalk | null> {
  const { db } = getFirebaseServices();
  const quizDoc = await getDoc(doc(db, "quizzes", quizId));
  if (!quizDoc.exists()) {
    return null;
  }

  const quizData = quizDoc.data() as { title: string };
  const waypointQuery = query(collection(db, `quizzes/${quizId}/waypoints`), orderBy("order", "asc"));
  const waypointSnapshot = await getDocs(waypointQuery);

  const waypoints = await Promise.all(
    waypointSnapshot.docs.map(async (waypointDoc) => {
      const waypointData = waypointDoc.data() as { order: number; title: string; lat: number; lng: number };
      const questionQuery = query(
        collection(db, `quizzes/${quizId}/waypoints/${waypointDoc.id}/questions`),
        orderBy("order", "asc")
      );
      const questionSnapshot = await getDocs(questionQuery);

      return {
        id: waypointDoc.id,
        order: waypointData.order,
        title: waypointData.title,
        lat: waypointData.lat,
        lng: waypointData.lng,
        questions: questionSnapshot.docs.map((questionDoc) => {
          const questionData = questionDoc.data() as {
            order: number;
            questionType?: QuestionType;
            text: string;
            funFact?: string | null;
            sourceUrl?: string | null;
            choices: Array<{ id: string; text: string }>;
            pointsIfCorrect: number;
            timerSeconds?: number | null;
          };
          return {
            id: questionDoc.id,
            order: questionData.order,
            questionType: questionData.questionType ?? "multiple_choice",
            text: questionData.text,
            funFact: questionData.funFact ?? undefined,
            sourceUrl: questionData.sourceUrl ?? undefined,
            choices: questionData.choices ?? [],
            pointsIfCorrect: questionData.pointsIfCorrect,
            config: {
              timerSeconds: questionData.timerSeconds ?? null,
              numericTolerance: null,
            },
          };
        }),
      };
    })
  );

  return { quizId, title: quizData.title, waypoints };
}

export async function startSession(quizId: string, nickname: string): Promise<string> {
  const { db } = getFirebaseServices();
  const anonymousUid = await getCurrentAuthUid();
  const sessionRef = await addDoc(collection(db, "participantSessions"), {
    quizId,
    nickname,
    anonymousUid,
    startedAt: serverTimestamp(),
    status: "active",
    score: 0,
    currentWaypointOrder: 1,
  });

  return sessionRef.id;
}

export async function getFirstPlayable(quizId: string): Promise<FirstPlayable | null> {
  const { db } = getFirebaseServices();
  const rulesDoc = await getDoc(doc(db, "quizRules", quizId));
  if (!rulesDoc.exists()) {
    return null;
  }
  const rules = rulesDoc.data() as { waypointGateRadiusMeters: number };

  const waypointQuery = query(
    collection(db, `quizzes/${quizId}/waypoints`),
    orderBy("order", "asc"),
    limit(1)
  );
  const waypointSnapshot = await getDocs(waypointQuery);
  if (waypointSnapshot.empty) {
    return null;
  }

  const firstWaypointDoc = waypointSnapshot.docs[0];
  const waypointData = firstWaypointDoc.data() as { title: string; lat: number; lng: number };

  const questionQuery = query(
    collection(db, `quizzes/${quizId}/waypoints/${firstWaypointDoc.id}/questions`),
    orderBy("order", "asc"),
    limit(1)
  );
  const questionSnapshot = await getDocs(questionQuery);
  if (questionSnapshot.empty) {
    return null;
  }

  const firstQuestionDoc = questionSnapshot.docs[0];
  const questionData = firstQuestionDoc.data() as {
    questionType?: QuestionType;
    text: string;
    choices: Array<{ id: string; text: string }>;
    pointsIfCorrect: number;
    timerSeconds?: number | null;
  };

  return {
    waypoint: {
      id: firstWaypointDoc.id,
      title: waypointData.title,
      lat: waypointData.lat,
      lng: waypointData.lng,
      gateRadiusMeters: rules.waypointGateRadiusMeters,
    },
    question: {
      id: firstQuestionDoc.id,
      questionType: questionData.questionType ?? "multiple_choice",
      text: questionData.text,
      choices: questionData.choices ?? [],
      pointsIfCorrect: questionData.pointsIfCorrect,
      config: {
        timerSeconds: questionData.timerSeconds ?? null,
        numericTolerance: null,
      },
    },
  };
}

export async function getWaypointCount(quizId: string): Promise<number> {
  const { db } = getFirebaseServices();
  const snapshot = await getCountFromServer(collection(db, `quizzes/${quizId}/waypoints`));
  return snapshot.data().count;
}

export async function submitFirstAnswer(params: {
  quizId: string;
  sessionId: string;
  waypointId: string;
  questionId: string;
  selectedChoiceIds: string[];
  numericAnswer?: number | null;
  letterOrderAnswer?: string | null;
  elapsedMs: number;
}): Promise<AnswerResult> {
  const { db } = getFirebaseServices();
  const questionDoc = await getDoc(
    doc(db, `quizzes/${params.quizId}/waypoints/${params.waypointId}/questions/${params.questionId}`)
  );
  if (!questionDoc.exists()) {
    throw new Error("Question not found");
  }

  const existingAnswers = await getDocs(collection(db, `participantSessions/${params.sessionId}/answers`));
  const alreadyAnswered = existingAnswers.docs.some((a) => {
    const data = a.data() as { questionId?: string };
    return data.questionId === params.questionId;
  });
  if (alreadyAnswered) {
    throw new Error("Question already answered");
  }

  const questionData = questionDoc.data() as {
    questionType?: QuestionType;
    correctChoiceIds?: string[];
    correctChoiceId: string | null;
    numericAnswer?: number | null;
    numericTolerance?: number | null;
    letterOrderAnswer?: string | null;
    pointsIfCorrect: number;
  };

  const questionType = questionData.questionType ?? "multiple_choice";
  let isCorrect: boolean;

  if (questionType === "numeric") {
    const expected = questionData.numericAnswer;
    const submitted = params.numericAnswer;
    const tolerance = questionData.numericTolerance ?? 0;
    isCorrect =
      typeof expected === "number" &&
      typeof submitted === "number" &&
      Math.abs(submitted - expected) <= tolerance;
  } else if (questionType === "letter_order") {
    const expected = (questionData.letterOrderAnswer ?? "").replace(/\s+/g, "").toUpperCase();
    const submitted = (params.letterOrderAnswer ?? "").replace(/\s+/g, "").toUpperCase();
    isCorrect = expected.length > 0 && submitted === expected;
  } else {
    const expected = Array.isArray(questionData.correctChoiceIds)
      ? [...questionData.correctChoiceIds]
      : questionData.correctChoiceId
        ? [questionData.correctChoiceId]
        : [];
    const submitted = params.selectedChoiceIds.filter((choiceId) => choiceId.trim().length > 0);
    const expectedSorted = [...new Set(expected)].sort();
    const submittedSorted = [...new Set(submitted)].sort();
    isCorrect =
      expectedSorted.length > 0 &&
      expectedSorted.length === submittedSorted.length &&
      expectedSorted.every((choiceId, index) => choiceId === submittedSorted[index]);
  }

  const pointsAwarded = isCorrect ? questionData.pointsIfCorrect : 0;
  const firstSelectedChoiceId = params.selectedChoiceIds[0] ?? "";
  const submittedChoiceValue = params.selectedChoiceIds.join(",");

  await addDoc(collection(db, `participantSessions/${params.sessionId}/answers`), {
    questionId: params.questionId,
    waypointId: params.waypointId,
    selectedChoiceId: firstSelectedChoiceId,
    selectedChoiceIds: params.selectedChoiceIds,
    submittedValue: params.numericAnswer ?? params.letterOrderAnswer ?? submittedChoiceValue,
    isCorrect,
    pointsAwarded,
    elapsedMs: params.elapsedMs,
    answeredAt: serverTimestamp(),
  });

  await updateDoc(doc(db, "participantSessions", params.sessionId), {
    score: increment(pointsAwarded),
    status: "completed",
    completedAt: serverTimestamp(),
  });

  const sessionDoc = await getDoc(doc(db, "participantSessions", params.sessionId));
  const currentScore = (sessionDoc.data() as { score?: number } | undefined)?.score ?? pointsAwarded;

  return {
    isCorrect,
    pointsAwarded,
    score: currentScore,
  };
}

export async function giftAiTokens(params: { targetUid?: string; targetEmail?: string; tokenCount: number }): Promise<{ uid: string; aiTokens: number }> {
  const { functions } = getFirebaseServices();
  const giftFn = httpsCallable<{ targetUid: string; targetEmail: string; tokenCount: number; adminPassword: string }, { uid: string; aiTokens: number }>(functions, "giftAiTokensCallable");
  const adminPassword = (import.meta.env.VITE_AI_GEN_PASSWORD ?? "").trim();
  const result = await giftFn({ targetUid: params.targetUid ?? "", targetEmail: params.targetEmail ?? "", tokenCount: params.tokenCount, adminPassword });
  return result.data;
}

export async function deleteQuiz(quizId: string, adminPassword?: string): Promise<void> {
  const { functions } = getFirebaseServices();
  const deleteQuizFn = httpsCallable(functions, "deleteQuizCallable");
  await deleteQuizFn({ quizId, adminPassword: adminPassword ?? "" });
}
