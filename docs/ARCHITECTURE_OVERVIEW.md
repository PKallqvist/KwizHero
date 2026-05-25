# KwizHero Architecture Overview (MVP)

## 1. Goals
- Fast iteration for hobby-to-production growth.
- Managed, secure platform services.
- Clear separation between domain logic and platform adapters.

## 2. Runtime Components
- PWA Frontend (React + TypeScript).
- Firebase Firestore (data persistence).
- Firebase Anonymous Auth (participant session identity — automatic sign-in, no account required).
- Firebase Cloud Functions (trusted server-side rules/transitions).
- Leaflet + OpenStreetMap (map and route authoring/playback).

## 3. High-Level Design
- Client-heavy application with validated domain commands.
- Firestore as source of truth for quiz definitions and participant sessions.
- Cloud Functions enforce publish transitions and sensitive state changes.

## 4. Bounded Contexts
- Quiz Management
  - metadata, publish status, visibility
- Ruleset Engine
  - timing windows, reveal modes, scoring strategy selection
  - `domain/reveal.ts` — `resolveRevealPhase()` determines what participants see after answering (full / score_only / hidden)
- Route/Waypoint Engine
  - waypoint ordering and geofence checks
  - `platform/map/geolocation.ts` — Haversine distance, browser geolocation adapter
- Question Engine
  - multiple-choice structure and validation
- Player Session
  - nickname, anonymousUid, progress, submissions, score snapshot
  - Session writes are auth-scoped via Firebase Anonymous Auth + Firestore rules

## 5. Data Access Pattern
- UI -> use-case/service -> repository -> Firestore
- Repositories map DTOs to domain models.
- Domain models remain independent from Firestore SDK.

## 6. Security Model (MVP)
- No creator accounts in MVP.
- Creator edit-key (SHA-256 hashed, stored in `quizSecrets`) required for publish transitions — validated server-side by Cloud Function.
- Participants sign in with Firebase Anonymous Auth automatically; no account required.
- Firestore rules restrict session/answer writes to the owning `anonymousUid`.
- Cloud Functions gate publish action and state transitions.

## 7. Scalability Notes
- Firestore supports MVP concurrency with minimal ops overhead.
- Avoid document hot spots by storing participant sessions as separate docs.
- Use query indexes for public listing and active quiz filtering.

## 8. PWA-to-Native Transfer Strategy
- Keep domain logic and schema transport-neutral.
- Encapsulate browser APIs (geolocation, storage, notifications) in platform adapters.
- Keep routing/state patterns compatible with future React Native move.

## 9. Observability Baseline
- Structured client logs for non-sensitive events.
- Function logs for publish/validation failures.
- Error budget review after each pilot run.
