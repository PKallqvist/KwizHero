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
- editKeyHash: string
- createdAt: timestamp
- updatedAt: timestamp
- publishedAt: timestamp | null
- ownerLabel: string (optional organizer label)

## 2.2 quizRules
Document id: quizId (or embedded under quizzes if preferred)

Fields:
- rulesetVersion: number
- openAt: timestamp
- closeAt: timestamp
- waypointGateRadiusMeters: number
- questionTimeLimitSeconds: number
- revealMode: "instant" | "on_completion" | "scheduled"
- revealAt: timestamp | null
- scoringStrategy: "binary_correct_1_point"
- winnerPolicy: "highest_score"

## 2.3 quizWaypoints
Document id: waypointId
Path suggestion: quizzes/{quizId}/waypoints/{waypointId}

Fields:
- order: number
- title: string
- lat: number
- lng: number
- gateRadiusMetersOverride: number | null
- createdAt: timestamp
- updatedAt: timestamp

## 2.4 waypointQuestions
Document id: questionId
Path suggestion: quizzes/{quizId}/waypoints/{waypointId}/questions/{questionId}

Fields:
- order: number
- text: string
- choices: array<{ id: string, text: string }>
- correctChoiceId: string
- pointsIfCorrect: number
- explanation: string | null
- createdAt: timestamp
- updatedAt: timestamp

## 2.5 participantSessions
Document id: sessionId

Fields:
- quizId: string
- nickname: string
- startedAt: timestamp
- completedAt: timestamp | null
- currentWaypointOrder: number
- score: number
- status: "active" | "completed" | "expired"

## 2.6 participantAnswers
Document id: answerId
Path suggestion: participantSessions/{sessionId}/answers/{answerId}

Fields:
- questionId: string
- waypointId: string
- selectedChoiceId: string
- isCorrect: boolean
- pointsAwarded: number
- answeredAt: timestamp
- elapsedMs: number

## 3. Suggested Indexes
- quizzes(status, visibility, updatedAt desc)
- quizzes(status, publishedAt desc)
- participantSessions(quizId, status, startedAt)

## 4. Integrity Rules
- Published quiz cannot be structurally edited.
- Answers accepted only while quiz is open.
- Duplicate answer for same question in a session is rejected (MVP single-attempt per question).

## 5. Validation Responsibilities
- Client: basic form and schema validation.
- Cloud Functions: trusted validation for publish, ruleset consistency, and answer submission invariants.

## 6. Future Extensions
- Add scoringStrategy variants as enum expansion + strategy config object.
- Add routeMode for virtual routes.
- Add decisive tie-breaker model.
- Add payment ledger collections (post-MVP).
