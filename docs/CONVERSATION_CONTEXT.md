# KwizHero — Conversation Context for Claude Code

This document captures the full design conversation and decisions made before implementation began. Read this alongside the other docs in `/docs` to understand not just *what* was decided but *why*.

---

## 1. The Name

**KwizHero** was chosen after an extensive naming process. Key decisions:
- Avoided premium/taken domains: quizhero.com, questmus.com were taken or premium
- "Kwiz" spelling deliberately avoids the premium quiz domain trap while keeping phonetic recognition
- "Hero" captures the winning/competition/achievement angle
- Domain **kwizhero.com** is registered and owned
- The name communicates walk + quiz + reward without spelling any of them out literally

---

## 2. The Concept

KwizHero is a **quiz walk app** — participants physically walk a route, unlock questions at GPS waypoints, and compete.

### Core appeal pillars (why people do this):
- **Social** — moving together, shared experience
- **Competition** — winning, prizes, status
- **Discovery** — seeing new things, exploring
- **Learning** — curiosity, knowledge
- **Outdoors** — fresh air, movement, health

This is essentially **gamified curiosity** — the app sits at the intersection of game, walk, and discovery.

### The flagship use case:
A youth soccer team runs a bi-weekly public quiz walk:
- Open for 2 weeks at a time
- Anyone can join via QR code or link
- Entry fee of 20 kr (collected by organizer, payment is post-MVP)
- Winner revealed when quiz closes
- Answers not revealed until end

---

## 3. Key Product Decisions

### No accounts in MVP
- Creator gets a secret edit key — save it or lose access
- Participant uses nickname only
- Firebase Anonymous Auth for participant session identity (important for security rules)
- Edit key must be hashed server-side (algorithm to be decided: bcrypt recommended)

### Edit key recovery
- Not yet fully defined — needs a policy
- Options: email recovery (needs email field), security question, accept loss as policy for MVP
- **This needs a decision before launch**

### PWA first, native later
- PWA chosen for zero install friction — scan QR, play immediately
- All domain logic must be framework-agnostic and browser-API-free for easy React Native migration later
- Browser APIs (geolocation, storage, notifications) must be wrapped in platform adapters

### Quiz locking
- Published quiz with entry fee → fully locked, no edits
- Published quiz without fee → possibly allow minor edits (typos) — not yet decided
- `lockedAt` timestamp should be added to data model

### Visibility modes
- Private: link/QR only
- Unlisted: link/QR only, not listed
- Public: discoverable in public listing + link/QR

---

## 4. The "Flavors" System (Post-MVP Vision)

One of the most distinctive planned features: **map overlays that rename real-world locations**.

Examples:
- A ruin becomes "Forgotten Temple"
- A statue becomes "Dormant God" or "Frozen Hero"
- A park becomes "Enchanted Forest"

This is AI-assisted — the system would automatically suggest fantasy/thematic renames based on location type.

**Key design insight:** Real-world GPS routes and virtual fantasy routes are the **same engine** — just different map skins and progress triggers. Build it once.

Route types planned:
- **Real world** — GPS required, physically reach waypoint
- **Virtual** — fantasy/overlay world, progress by steps or distance walked

This is explicitly post-MVP but architecture must not make it hard to add.

---

## 5. Tech Stack Decisions and Reasoning

### Frontend
- **React + TypeScript** — standard, native-ready
- **Mantine** — chosen over Tailwind (owner preference), first-class theming with CSS variables, dark/light mode, accessible components
- **i18next + react-i18next** — localization from day one, EN + SV
- **Vite** — build tool
- **Leaflet + OpenStreetMap** — free map, no API costs

### Backend
- **Firebase Firestore** — chosen because:
  - Fully managed (owner wants someone else handling security/compliance)
  - Never pauses (unlike Supabase free tier which pauses after 1 week)
  - NoSQL fits the nested document structure naturally (quiz → waypoints → questions)
  - Google-managed, battle tested at scale
  - Owner has MongoDB experience so NoSQL is comfortable
- **Firebase Cloud Functions** — server-side validation, publish transitions
- **Firebase Anonymous Auth** — participant identity without accounts

### Payments (post-MVP)
- **Stripe** — international standard, handles PCI compliance
- **Swish** — essential for Swedish market
- Owner specifically wants managed payment solution — never handle card data directly

### Hosting
- **Vercel** — frontend deployment

### Why not Supabase?
- Free tier limited to 2 active projects and pauses after 1 week of inactivity
- Owner already has 2 Supabase projects
- Firebase chosen for managed reliability

### Why not PocketBase?
- Self-hosted = owner manages security
- When money is involved, owner wants established managed services

---

## 6. Module Structure Decisions

Feature-sliced architecture as defined in AGENT_IMPLEMENTATION_GUIDE.md. Key principle: **domain logic must never depend on UI framework or Firebase SDK directly**.

~~One inconsistency found in existing code: `src/main.tsx` imports theme from `./theme/kwizTheme`. Should be `platform/theme`.~~ **Fixed** — `kwizTheme` now lives at `src/platform/theme/kwizTheme.ts`.

---

## 7. Data Model Decisions and Open Questions

### Decided
- Quiz definition immutable once published
- Participant sessions separate from quiz definitions
- Answers stored as subcollection of sessions
- Edit key stored as SHA-256 hex hash (never plain text, stored in `quizSecrets` collection)
- **quizRules**: implemented as a **separate top-level collection** `quizRules/{quizId}` (not embedded in quiz document)
- **editKeyHash algorithm**: SHA-256 hex via `crypto.subtle` — no bcrypt dependency needed for MVP
- **anonymousUid**: ✅ added to `participantSessions`; Firebase Anonymous Auth signs in automatically before session creation; Firestore rules scope writes to the owning uid
- **choices array max length**: 4 (A/B/C/D), enforced in creator form and data model
- **revealMode / revealAt**: ✅ stored in quizRules, read in QuizSummary, respected in player UI via `resolveRevealPhase()`

### Still open / needs decision before launch
- **lockedAt timestamp**: should be added to `quizzes` document when paid-entry quiz locking is introduced (post-MVP)
- **Edit key recovery**: no recovery mechanism in MVP — show a clear warning to the creator at publish time; decide policy before any paid-entry launch
- **tiebreaker question model**: listed in winnerPolicy but not yet defined; deferred post-MVP

---

## 8. UX Decisions

### Creator experience
- Desktop-first, wizard-style (one thing at a time)
- Sensible defaults everywhere to reduce overwhelm
- Draft autosave
- Explicit save/print prompt for edit key

### Participant experience
- Mobile-first
- No install required (PWA)
- Under 30 seconds from scan to playing
- Outdoor readability: high contrast, large touch targets (44x44px min)
- One primary action per screen

### Missing flows (need to be added to UX_FLOWS.md)
- Draft re-entry flow (how creator returns to edit with edit key)
- Edit key loss/recovery flow
- Leaderboard/results view (seeing others' scores)
- Quiz not yet open vs quiz already closed (different states)

---

## 9. Ruleset System

The ruleset is the heart of KwizHero's flexibility. Every quiz has a versioned ruleset.

### MVP ruleset fields
- `openAt` / `closeAt` — quiz window
- `routeMode` — real_gps (MVP only)
- `waypointGateRadiusMeters` — default + per-waypoint override
- `questionTimeLimitSeconds` — per question
- `revealMode` — instant | on_completion | scheduled
- `revealAt` — required if scheduled
- `scoringStrategy` — binary_correct_1_point (MVP)
- `winnerPolicy` — highest_score (MVP)

### Post-MVP scoring strategies
- Time-based (faster = more points)
- Proximity (how close your answer is to correct number)
- Distance (how far you walked)
- Combo

### Post-MVP winner policies
- Tiebreaker by decisive question (needs model definition)
- First to finish

---

## 10. What to Build First (Agreed Order)

1. Core quiz schema and ruleset validation
2. Creator wizard with draft saving
3. Participant join and play flow
4. GPS waypoint gating
5. Reveal mode behavior
6. Localization and theming hardening
7. QA and pilot event (soccer team)

---

## 11. Success Criteria

- Organizer creates and publishes quiz in under 15 minutes without help
- Participant joins and starts in under 30 seconds from scan
- 90%+ successful waypoint unlocks under normal GPS conditions
- Soccer team runs first bi-weekly event successfully

---

## 12. Things Explicitly Not in MVP

- Payment collection / Swish / Stripe
- User accounts and team collaboration
- Native app
- Advanced anti-cheat
- AI map flavor generation
- Virtual route mode
- Advanced scoring strategies
- Tiebreaker question mechanic
- Edit key recovery system (document risk, add policy later)
