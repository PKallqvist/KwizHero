# KwizHero Setup and Runbook (MVP)

## 1. Prerequisites
- Node.js LTS.
- Package manager: pnpm (recommended) or npm.
- Firebase project (development).
- Firebase CLI installed.

## 2. Initial Repository Setup
1. Initialize frontend app (React + TypeScript + PWA support).
2. Add UI library and i18n dependencies.
3. Add map dependencies (Leaflet).
4. Configure linting and formatting.
5. Configure unit and e2e test runners.

## 3. Environment Variables
Create local env file with:
- Firebase project id
- Firebase api key
- Firebase auth domain
- Firestore database id
- Map tile endpoint config

Current frontend env vars:
- VITE_FIREBASE_API_KEY
- VITE_FIREBASE_AUTH_DOMAIN
- VITE_FIREBASE_PROJECT_ID
- VITE_FIREBASE_APP_ID
- VITE_AI_GEN_PASSWORD  (temporary admin preview gate)

Current Functions env vars:
- OPENAI_API_KEY  (used by `generateAiQuestionCallable`)

Never commit secrets.

## 4. Firebase Setup Steps
1. Create Firestore database in test mode (dev only).
2. Add initial security rules and indexes.
3. Enable Cloud Functions.
4. Configure local emulator for Firestore and Functions.
5. Set Functions runtime env: `firebase functions:config:set openai.key="<your-key>"` (or equivalent secret manager setup) and map it to `OPENAI_API_KEY` in deployment config.
6. Seed admin preview token balance manually in `playerProfiles/{uid}` (example: `aiTokens: 9999`).

## 5. Local Development Workflow
1. Start Firebase emulators.
2. Start web app dev server.
3. Run unit tests in watch mode.
4. Run e2e smoke tests before merge.

## 6. Branch and PR Policy
- Use short-lived feature branches.
- PR requires:
  - passing lint/type/test checks
  - updated docs where behavior changed
  - localization parity (EN + SV)

## 7. Deployment Baseline
- Preview deployments on each PR.
- Staging deploy on main branch.
- Production deploy by tagged release.
- Keep release notes for behavior and schema changes.

## 8. Incident Notes (MVP)
If quiz session failures occur during event:
1. Capture function logs and client error traces.
2. Freeze publishes until root cause identified.
3. Apply hotfix with focused regression tests.
