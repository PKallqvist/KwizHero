import {
  addDoc,
  collection,
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
  updateDoc,
} from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions } from "./firebase";
import type { AnswerResult, FirstPlayable, QuizDraftInput, QuizSummary } from "../../domain/types";

async function getAnonymousUid(): Promise<string> {
  if (auth.currentUser) return auth.currentUser.uid;
  const credential = await signInAnonymously(auth);
  return credential.user.uid;
}

export interface CreatedQuiz {
  quizId: string;
  editKey: string;
}

function randomKey(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function createDraftQuiz(input: QuizDraftInput): Promise<CreatedQuiz> {
  const editKey = randomKey();
  const editKeyHash = await sha256Hex(editKey);
  const quizRef = await addDoc(collection(db, "quizzes"), {
    title: input.title,
    description: input.description,
    status: "draft",
    defaultLocale: input.locale,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    waypointCount: input.waypoints.length,
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
    revealMode: input.ruleset.revealMode,
    revealAt: input.ruleset.revealAt,
    waypointGateRadiusMeters: input.ruleset.waypointGateRadiusMeters,
    scoringStrategy: input.ruleset.scoringStrategy,
    winnerPolicy: "highest_score",
    updatedAt: serverTimestamp(),
  });

  for (let i = 0; i < input.waypoints.length; i += 1) {
    const waypoint = input.waypoints[i];
    const waypointRef = doc(collection(db, `quizzes/${quizRef.id}/waypoints`));
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
      await addDoc(collection(db, `quizzes/${quizRef.id}/waypoints/${waypointRef.id}/questions`), {
        order: qIndex + 1,
        text: question.text,
        choices: question.choices.map((c, index) => ({ id: `c${index + 1}`, text: c })),
        correctChoiceId: `c${question.correctIndex + 1}`,
        pointsIfCorrect: 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  }

  return { quizId: quizRef.id, editKey };
}

export async function publishQuiz(quizId: string, editKey: string): Promise<void> {
  const callPublish = httpsCallable(functions, "publishQuizCallable");
  await callPublish({ quizId, editKey });
}

export async function getQuizSummary(quizId: string): Promise<QuizSummary | null> {
  const quizDoc = await getDoc(doc(db, "quizzes", quizId));
  const rulesDoc = await getDoc(doc(db, "quizRules", quizId));
  if (!quizDoc.exists() || !rulesDoc.exists()) {
    return null;
  }

  const q = quizDoc.data() as {
    title: string;
    description: string;
    status: "draft" | "published";
  };
  const r = rulesDoc.data() as {
    openAt: string;
    closeAt: string;
    revealMode: "instant" | "on_completion" | "scheduled";
    revealAt: string | null;
  };

  return {
    id: quizId,
    title: q.title,
    description: q.description,
    status: q.status,
    openAt: r.openAt,
    closeAt: r.closeAt,
    revealMode: r.revealMode ?? "instant",
    revealAt: r.revealAt ?? null,
  };
}

export async function startSession(quizId: string, nickname: string): Promise<string> {
  const anonymousUid = await getAnonymousUid();
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
    text: string;
    choices: Array<{ id: string; text: string }>;
    pointsIfCorrect: number;
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
      text: questionData.text,
      choices: questionData.choices,
      pointsIfCorrect: questionData.pointsIfCorrect,
    },
  };
}

export async function getWaypointCount(quizId: string): Promise<number> {
  const snapshot = await getCountFromServer(collection(db, `quizzes/${quizId}/waypoints`));
  return snapshot.data().count;
}

export async function submitFirstAnswer(params: {
  quizId: string;
  sessionId: string;
  waypointId: string;
  questionId: string;
  selectedChoiceId: string;
  elapsedMs: number;
}): Promise<AnswerResult> {
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
    correctChoiceId: string;
    pointsIfCorrect: number;
  };

  const isCorrect = params.selectedChoiceId === questionData.correctChoiceId;
  const pointsAwarded = isCorrect ? questionData.pointsIfCorrect : 0;

  await addDoc(collection(db, `participantSessions/${params.sessionId}/answers`), {
    questionId: params.questionId,
    waypointId: params.waypointId,
    selectedChoiceId: params.selectedChoiceId,
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
