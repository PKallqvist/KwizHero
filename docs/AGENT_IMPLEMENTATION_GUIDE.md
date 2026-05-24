# KwizHero Agent Implementation Guide

## 1. Document Purpose
This guide defines how engineering agents and contributors should implement KwizHero with clean modular design, consistent quality, and predictable delivery.

## 2. Core Engineering Principles
- Keep domain logic framework-agnostic.
- Prefer small composable modules over large feature files.
- Keep UI concerns separate from rules/scoring/geofence logic.
- Define contracts first (types/interfaces/schema) before feature code.
- All behavior changes require tests.

## 3. Target Stack (MVP)
- Frontend: React + TypeScript PWA.
- UI system: Mantine (or equivalent component library with theme tokens).
- Backend: Firebase (Firestore + Cloud Functions).
- Map: Leaflet + OpenStreetMap.
- i18n: i18next + react-i18next.

## 4. Module Boundaries
Use feature-sliced domains with shared platform services.

- domain/quiz
  - quiz lifecycle, publish rules, validation
- domain/ruleset
  - reveal rules, timers, scoring strategy selection
- domain/route
  - waypoints, ordering, gating policies
- domain/question
  - question model, options, answer validation
- domain/scoring
  - scoring interfaces and strategy implementations
- app/creator
  - creator pages, forms, and orchestration
- app/player
  - participant pages and state flow
- platform/map
  - map adapter and geospatial helpers
- platform/backend
  - firebase repositories, DTO mapping
- platform/i18n
  - locale setup, keys, formatting
- platform/theme
  - tokens, themes, runtime switching

## 5. Coding Standards
- TypeScript strict mode required.
- No any unless justified with inline TODO and issue reference.
- Use schema validation for all external input (creator forms, URL params, backend payloads).
- Keep functions short and deterministic where possible.
- Prefer pure functions in domain modules.
- No direct Firestore access inside UI components.

## 6. State and Data Flow
- UI state in component/store layer.
- Domain services orchestrate use-cases.
- Repository layer handles Firestore specifics.
- DTO-to-domain mapping at repository boundary.

Flow pattern:
1. UI event
2. use-case/service call
3. repository read/write
4. domain result
5. localized UI feedback

## 7. Responsiveness Rules
- Creator experience optimized for desktop/tablet.
- Participant experience optimized for mobile.
- Breakpoint requirements:
  - small: touch-first single-column.
  - medium: stacked panels.
  - large: map + side panel split.
- Never hide critical actions behind hover-only interactions.

## 8. Theming Rules
- Theme via design tokens only (color, spacing, radius, typography, elevation).
- No raw hardcoded colors in feature components.
- Provide at least:
  - default theme
  - high-contrast variant
- Theme choice can be quiz-specific in schema, but UI shell must remain accessible.

## 9. Localization Rules
- Source locale keys in English; provide Swedish translation parity.
- No hardcoded user-facing strings in components.
- Use namespaced keys:
  - common.*
  - creator.*
  - player.*
  - validation.*
- Date/time/number formatting must be locale-aware.

## 10. Testing Policy
Required for each new feature:
- Unit tests for domain logic.
- Integration tests for repository/use-case flows.
- E2E smoke path for creator and participant critical paths.

Must-test areas:
- rule window open/close behavior
- question timer expiration
- waypoint geofence unlock checks
- reveal modes
- scoring strategy outputs

## 11. Quality Gates (Definition of Done)
A change is done only if:
- Types pass and lint passes.
- Tests are added/updated and passing.
- Strings are localized (EN + SV).
- Theme tokens used (no style regressions).
- Docs updated when contracts or behavior changed.

## 12. Security and Trust Baseline
- Use Firebase Security Rules from first commit.
- Edit key must never be logged in plain text client logs.
- Restrict write operations to intended document paths.
- Add backend-side validation in Cloud Functions for publish transitions.

## 13. Delivery Workflow
- Small PRs with one concern each.
- PR template must include:
  - scope
  - risk
  - test evidence
  - localization/theming checklist
- Prefer incremental slices over broad unfinished frameworks.

## 14. Native-Ready Guidance
PWA is primary, but preserve easy migration path:
- Keep domain services UI-framework independent.
- Keep map/geo providers behind adapters.
- Keep navigation and storage abstractions replaceable.
- Avoid browser-only APIs directly in domain logic.
