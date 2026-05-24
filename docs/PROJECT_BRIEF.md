# KwizHero Project Brief (MVP)

## 1. Purpose
KwizHero is a quiz-walk web app where organizers create location-based quizzes and participants walk a route, unlock questions at waypoints, and compete.

Initial real use case:
- A bi-weekly public quiz run by a youth soccer team.
- Participants join via QR code or link.
- Winner is revealed when the quiz closes.

## 2. Product Vision
Create a fast, playful, and trustworthy quiz experience that combines movement, discovery, and competition.

Design goals:
- Easy creation on desktop.
- Easy participation on mobile.
- No account friction in MVP.
- Ruleset-driven engine that supports multiple quiz formats.

## 3. Primary Personas
- Organizer (creator): sets up quiz route, questions, rules, and publishing options.
- Participant (player): joins quickly, walks route, answers questions, views results according to reveal rules.

## 4. MVP Scope
### 4.1 Included
- Quiz creation wizard (desktop-first responsive).
- Route creation with waypoints (GPS-gated progression).
- Multiple-choice questions.
- Waypoint can contain 0..N questions.
- Ruleset configuration:
  - Quiz open/close datetime window.
  - Per-question time limit.
  - Answer reveal mode: instant, end-of-quiz, scheduled datetime.
  - Scoring strategy v1: 1 point per correct answer.
- Publishing options:
  - Private link.
  - QR code.
  - Public listing (toggle).
- Edit security:
  - Single secret edit key per quiz.
- Participant identity:
  - Nickname only (no login).
- Localization:
  - Swedish and English UI from day one.
- Theming:
  - Token-based theme system from day one.

### 4.2 Excluded (Post-MVP)
- Payment collection and payout logic.
- User accounts and team collaboration.
- Native app implementation.
- Advanced anti-cheat controls.
- AI map flavor generation automation (documented as future extension).

## 5. Non-Functional Requirements
- Platform: PWA first.
- Performance:
  - Initial load target <= 2.5s on mid-tier mobile over 4G.
  - Route/question transitions feel instant (< 150ms UI reaction target).
- Reliability:
  - Draft autosave for creator flow.
  - Graceful handling of temporary GPS/network issues.
- Accessibility:
  - Keyboard-accessible creator flow.
  - Color contrast WCAG AA baseline.
- Security:
  - Managed backend services only.
  - No sensitive payment data in MVP.

## 6. User Flows (High Level)
### 6.1 Creator Flow
1. Create quiz metadata (title, description, language default, theme).
2. Configure ruleset.
3. Create route and waypoint gates.
4. Add questions per waypoint.
5. Review and publish.
6. Share via QR/link.

### 6.2 Participant Flow
1. Open QR/link.
2. Enter nickname.
3. Start quiz (if inside open window).
4. Reach waypoint to unlock questions.
5. Answer and continue.
6. See results according to reveal mode.

## 7. Ruleset Model (MVP)
Ruleset must be configurable per quiz and versioned.

Required rules:
- openAt / closeAt
- routeMode: real-world GPS (MVP)
- waypointGateRadiusMeters
- questionTimeLimitSeconds
- revealMode: instant | on_completion | scheduled
- revealAt (required if scheduled)
- scoringStrategy: binary_correct_1_point
- winnerPolicy:
  - highest_score
  - tiebreaker_by_decisive_question (future compatible)

## 8. Success Criteria
- Organizer can create and publish a valid quiz without docs/help in under 15 minutes.
- Participant can join and start in under 30 seconds from scan.
- 90%+ successful waypoint unlock checks under normal GPS conditions.

## 9. Risks and Mitigations
- GPS drift can frustrate users.
  - Mitigation: configurable waypoint radius and retry guidance UX.
- Rule complexity can overwhelm creators.
  - Mitigation: presets + sensible defaults in wizard.
- No accounts can cause edit-key loss.
  - Mitigation: explicit save/print prompt and recovery policy.

## 10. Implementation Order (Recommended)
1. Core quiz schema and ruleset validation.
2. Creator wizard with draft saving.
3. Participant join and play flow.
4. GPS waypoint gating.
5. Reveal mode behavior.
6. Localization and theming hardening.
7. QA and pilot event.
