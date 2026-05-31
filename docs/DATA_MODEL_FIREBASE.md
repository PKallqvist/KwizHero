# KwizHero Data Model and Firestore Schema (MVP)

## 1. Principles
- Keep quiz definition immutable once published (except explicit safe fields if later allowed).
- Separate quiz definition from participant progress.
- Version ruleset for future compatibility.

## 2. Collections

## 2.1 quizzes
Document id: quizId

Fields:
- title: string
- description: string
- status: "draft" | "published" | "closed"
- visibility: "private" | "unlisted" | "public"
- defaultLocale: "sv" | "en"
- themeId: string
- editKeyHash: string (not stored here — stored in quizSecrets)
- createdAt: timestamp
- updatedAt: timestamp
- publishedAt: timestamp | null
- lockedAt: timestamp | null  ← add when publish-with-fee locking is implemented
- waypointCount: number
- ownerLabel: string (optional organizer label, post-MVP)

## 2.2 quizSecrets
Document id: quizId (separate top-level collection, never readable by clients)

Fields:
- editKeyHash: string  (SHA-256 hex of the plain-text edit key)
- createdAt: timestamp

Note: The edit key is hashed client-side with SHA-256 before storage. The plain-text key is shown to the creator once at publish time and is never stored. Recovery is out of scope for MVP — document this risk explicitly.

## 2.3 quizRules
Document id: quizId (separate top-level collection — NOT embedded in quizzes)

Implementation note: The docs originally said "or embedded under quizzes if preferred." The MVP decision is a **separate top-level collection** (`quizRules/{quizId}`), which avoids over-growing the quiz document and aligns with how getQuizSummary fetches rules in parallel.

Fields:
- rulesetVersion: number
- openAt: timestamp (stored as ISO string in client, Firestore timestamp when possible)
- closeAt: timestamp
- waypointGateRadiusMeters: number
- questionTimeLimitSeconds: number
- revealMode: "instant" | "on_completion" | "scheduled"
- revealAt: timestamp | null  (required when revealMode === "scheduled")
- scoringStrategy: "binary_correct_1_point"
- winnerPolicy: "highest_score"
- updatedAt: timestamp

## 2.4 quizWaypoints
Document id: waypointId
Path: quizzes/{quizId}/waypoints/{waypointId}

Fields:
- order: number
- title: string
- lat: number
- lng: number
- gateRadiusMetersOverride: number | null
- createdAt: timestamp
- updatedAt: timestamp

Note: The effective gate radius for a waypoint is `gateRadiusMetersOverride ?? quizRules.waypointGateRadiusMeters`.

## 2.5 waypointQuestions
Document id: questionId
Path: quizzes/{quizId}/waypoints/{waypointId}/questions/{questionId}

Fields:
- order: number
- text: string
- choices: array<{ id: string, text: string }>  (4 choices in MVP, ids: c1–c4)
- correctChoiceId: string
- pointsIfCorrect: number  (always 1 in MVP binary scoring)
- explanation: string | null  (post-MVP reveal use)
- createdAt: timestamp
- updatedAt: timestamp

## 2.6 participantSessions
Document id: sessionId (auto-generated)

Fields:
- quizId: string
- nickname: string  (2–32 chars, validated in Firestore rules)
- anonymousUid: string  ← Firebase Anonymous Auth UID; required for security rules ownership checks
- startedAt: timestamp
- completedAt: timestamp | null
- currentWaypointOrder: number
- score: number
- status: "active" | "completed" | "expired"

Security note: Firestore rules require `request.auth.uid == request.resource.data.anonymousUid` on create, and `request.auth.uid == resource.data.anonymousUid` on update. Session writes are scoped to the owning anonymous user.

## 2.7 participantAnswers
Document id: answerId (auto-generated)
Path: participantSessions/{sessionId}/answers/{answerId}

Fields:
- questionId: string
- waypointId: string
- selectedChoiceId: string
- isCorrect: boolean
- pointsAwarded: number
- answeredAt: timestamp
- elapsedMs: number

Security note: Answer creates are gated on the writer owning the parent session (`request.auth.uid == get(participantSessions/{sessionId}).data.anonymousUid`).

## 2.8 playerProfiles
Document id: uid (Firebase Anonymous Auth UID for now)

Fields used by profile + AI token preview:
- quizzesCompleted: number
- quizzesCreatedPublished: number
- quizzesPlayedTotal: number
- playStreakDays: number
- perfectQuizzesCompleted: number
- lastCompletedQuizDate: string | null
- triggeredEventKeys: string[]
- earnedTierByBadgeId: map<string, number>
- earnedDiscoveryBadgeIds: string[]
- firstDiscoverySeen: boolean
- firstDiscoveryProfileLabelSeen: boolean
- aiTokens: number
- aiTokensGranted: number
- aiTokensPurchased: number
- aiTokensUsed: number
- aiTokensResetDate: string (ISO timestamp, defaults to account creation + 30 days)
- updatedAt: timestamp

Notes:
- AI token fields are initialized with safe defaults when absent.
- Manual admin seeding is supported by editing `playerProfiles/{uid}` in Firebase Console.

## 2.9 waypointQuestions (AI addition)
Path: quizzes/{quizId}/waypoints/{waypointId}/questions/{questionId}

Additional field stored for future UX:
- funFact: string | null

Note:
- `funFact` is stored now but not yet rendered in player UI.

## 3. Suggested Indexes
- quizzes(status ASC, updatedAt DESC)
- quizzes(status ASC, publishedAt DESC)
- participantSessions(quizId ASC, startedAt DESC)
- participantSessions(quizId ASC, status ASC, startedAt ASC)

## 4. Integrity Rules
- Published quiz cannot be structurally edited.
- Answers accepted only while quiz is open (enforced by Cloud Function in future; client-side for MVP).
- Duplicate answer for same question in a session is rejected (client-side guard in submitFirstAnswer).

## 5. Validation Responsibilities
- Client: basic form and schema validation; duplicate-answer guard.
- Cloud Functions: trusted validation for publish, ruleset consistency.
- Firestore Rules: auth ownership for session/answer writes; field presence checks.

## 6. Future Extensions
- Add scoringStrategy variants as enum expansion + strategy config object.
- Add routeMode for virtual routes.
- Add decisive tiebreaker model (question-level).
- Add payment ledger collections (post-MVP).
- Add lockedAt once paid-entry locking is implemented.
- Add explanation field reveal to player UI (already stored in questions).
- Move AI token charge flow to backend-only when paid/login rollout starts.
