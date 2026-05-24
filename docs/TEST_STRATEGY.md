# KwizHero Test Strategy (MVP)

## 1. Goals
- Protect ruleset correctness.
- Protect GPS-gated progression behavior.
- Ensure stable creator and participant critical paths.

## 2. Test Pyramid
- Unit tests (largest): domain and utility logic.
- Integration tests: repositories, use-cases, Cloud Functions.
- E2E tests: user-critical flows across UI.

## 3. Unit Test Scope
- Ruleset validators (open/close windows, reveal mode constraints).
- Scoring strategy output.
- Question timer calculations.
- Geofence calculations (distance/radius checks).
- Localization fallback helpers.

## 4. Integration Test Scope
- Publish flow validation from draft to published.
- Participant answer submission and scoring persistence.
- Reveal behavior across instant/end/scheduled.
- Firestore security rule expectations.

## 5. E2E Smoke Paths
- Creator creates quiz and publishes.
- Participant joins via link, completes waypoint, submits answers.
- Participant blocked when outside waypoint gate.
- Participant sees expected result behavior for selected reveal mode.

## 6. GPS and Device Scenarios
- Simulated near-boundary GPS values.
- Permission denied flow.
- Intermittent location updates.
- Small-screen mobile layout check.

## 7. Quality Gates
Minimum before release candidate:
- Unit tests passing.
- Integration suite passing.
- E2E smoke suite passing.
- No critical accessibility regression.
- No localization missing keys in EN/SV.

## 8. Regression Checklist
- Publish lock enforcement.
- Answer duplication rejection.
- Timer expiration behavior.
- Scheduled reveal timing.
- Public/private visibility behavior.
