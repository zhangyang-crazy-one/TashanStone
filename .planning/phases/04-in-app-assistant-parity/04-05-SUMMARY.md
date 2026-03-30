---
phase: 04-in-app-assistant-parity
plan: 05
subsystem: settings-ui
tags:
  - in-app
  - settings
  - assistant
  - ui
  - testing
requires:
  - 04-01
provides:
  - Truthful assistant settings modal content that hides deferred planning shells from the default user path
  - Presentation regression coverage that fails if planning-state copy reappears in the modal
affects:
  - components/AISettingsModal.tsx
  - src/services/assistant-runtime/settingsCatalog.ts
  - utils/translations.ts
  - test/components
  - test/services
tech-stack:
  added: []
  patterns:
    - resolve user-facing assistant settings surfaces by filtering deferred catalog sections before rendering
    - keep planning metadata in the settings catalog for internal wiring while excluding it from the shipped modal surface
key-files:
  created:
    - test/components/AISettingsModalPresentation.test.tsx
  modified:
    - components/AISettingsModal.tsx
    - src/services/assistant-runtime/settingsCatalog.ts
    - utils/translations.ts
    - test/services/assistantSettingsPersistence.test.tsx
decisions:
  - Keep deferred assistant settings metadata in the catalog but expose only available sections through a dedicated user-facing resolver.
  - Remove the planning shell card from the modal instead of relabeling it, so the shipped settings surface only presents usable controls.
requirements-completed:
  - APP-01
completed: 2026-03-30T10:29:59+08:00
---

# Phase 04 Plan 05: Truthful Assistant Settings Summary

The in-app assistant settings modal now shows only shipped controls and no longer exposes blueprint or phase-readiness copy as if it were usable product surface.

## Outcome

Tasks completed: 2/2

- Removed the planning-state assistant settings shell card and related phase labels from the user-facing modal.
- Added a user-facing catalog resolver that filters deferred sections while preserving internal metadata for future wiring.
- Locked the behavior with a focused `AISettingsModalPresentation` component test alongside the existing persistence regression coverage.

## Verification

- `bun run vitest run test/services/assistantSettingsPersistence.test.tsx test/components/AISettingsModalPresentation.test.tsx`
- `bun run tsc --noEmit`

## Task Commits

1. `0e98c31` `test(04-05): add failing truthful settings modal regression`
2. `59bb5b4` `feat(04-05): hide planning-state assistant settings shell`
3. `8fad11f` `test(04-05): add truthful settings modal presentation coverage`

## Files Created/Modified

- `components/AISettingsModal.tsx` - Removes the misleading settings blueprint shell from the shipped modal body.
- `src/services/assistant-runtime/settingsCatalog.ts` - Adds a user-facing resolver that filters deferred assistant settings sections.
- `utils/translations.ts` - Keeps assistant settings copy aligned with the truthful shipped surface.
- `test/services/assistantSettingsPersistence.test.tsx` - Drives the initial regression for hiding planning-state assistant shell messaging.
- `test/components/AISettingsModalPresentation.test.tsx` - Verifies real tabs remain while planning-state copy and deferred shell selectors stay hidden.

## Deviations from Plan

None - plan executed exactly as written.

## Next Phase Readiness

04-06 can now build explicit workspace-context threading on top of a truthful settings surface. The Phase 04 gap-closure sequence is ready to continue with runtime/app-shell context controls.

## Self-Check: PASSED
