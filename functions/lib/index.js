"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publishQuizCallable = void 0;
const node_crypto_1 = require("node:crypto");
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
(0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
function sha256Hex(value) {
    return (0, node_crypto_1.createHash)("sha256").update(value, "utf8").digest("hex");
}
exports.publishQuizCallable = (0, https_1.onCall)(async (request) => {
    const quizId = String(request.data?.quizId ?? "").trim();
    const editKey = String(request.data?.editKey ?? "").trim();
    if (!quizId || !editKey) {
        throw new https_1.HttpsError("invalid-argument", "quizId and editKey are required");
    }
    const secretSnap = await db.collection("quizSecrets").doc(quizId).get();
    if (!secretSnap.exists) {
        throw new https_1.HttpsError("not-found", "Quiz secret not found");
    }
    const storedHash = String(secretSnap.get("editKeyHash") ?? "");
    const incomingHash = sha256Hex(editKey);
    if (!storedHash || incomingHash !== storedHash) {
        throw new https_1.HttpsError("permission-denied", "Invalid edit key");
    }
    const quizRef = db.collection("quizzes").doc(quizId);
    const quizSnap = await quizRef.get();
    if (!quizSnap.exists) {
        throw new https_1.HttpsError("not-found", "Quiz not found");
    }
    const status = String(quizSnap.get("status") ?? "draft");
    if (status === "published") {
        return { ok: true, status: "published" };
    }
    await quizRef.update({
        status: "published",
        publishedAt: firestore_1.FieldValue.serverTimestamp(),
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    });
    return { ok: true, status: "published" };
});
//# sourceMappingURL=index.js.map