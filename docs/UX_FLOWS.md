# KwizHero UX Flows (MVP)

## 1. UX Objectives
- Minimize friction from entry to action.
- Keep creation predictable and recoverable.
- Keep gameplay focused and legible outdoors.

## 2. Creator Flow (Desktop-First)

## 2.1 Create Draft
1. Enter title and description.
2. Select default locale and theme.
3. Save draft automatically.

## 2.2 Configure Ruleset
1. Set open and close datetime.
2. Set question timer.
3. Choose reveal mode.
4. Set waypoint gate radius.
5. Confirm scoring strategy preset.

## 2.3 Build Route
1. Open map and place waypoints in order.
2. Set waypoint labels.
3. Reorder if needed.

## 2.4 Add Questions
1. Select waypoint.
2. Add one or more multiple-choice questions.
3. Set correct option and points.
4. Validate waypoint completeness.

## 2.5 Review and Publish
1. Run checklist (timing, route, question count).
2. Publish with edit-key confirmation.
3. Show QR/link share panel.

## 3. Participant Flow (Mobile-First)

## 3.1 Join
1. Open via QR or link.
2. Enter nickname.
3. Read compact quiz intro and rules.

## 3.2 Play
1. Navigate to current waypoint.
2. Unlock on geofence pass.
3. Answer questions before timer expires.
4. Proceed to next waypoint.

## 3.3 Finish
1. Receive completion state.
2. Reveal answers based on mode.
3. Show score and final status.

## 4. Critical UX States
- Quiz not started yet.
- Quiz closed.
- GPS permission denied.
- GPS accuracy low.
- Network temporary unavailable.
- Timer expired.
- Scheduled reveal pending.

## 5. UX Guardrails
- Mobile touch targets >= 44x44 px.
- Outdoor readability with high contrast text and large primary actions.
- Show one primary action per screen where possible.
- Avoid deep nesting in creator wizard.

## 6. Accessibility Baseline
- Keyboard navigation in creator flow.
- Visible focus states.
- ARIA labels for map controls and timer states.
- Color is never the only status signal.
