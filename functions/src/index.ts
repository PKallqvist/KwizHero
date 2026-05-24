import { createHash } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";

initializeApp();
const db = getFirestore();

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

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
