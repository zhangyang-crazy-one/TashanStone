---
phase: 04-in-app-assistant-parity
plan: 06
subsystem: app-shell-runtime
tags:
  - in-app
  - workspace-context
  - runtime
  - app-shell
  - testing
requires:
  - 04-02
  - 04-05
provides:
  - App-owned workspace context controls threaded through AppShell, AppWorkspace, and ChatPanel
  - Runtime request assembly that honors explicit focused-note versus open-panes grounding plus selected-text injection
  - Component proof that app-shell context state reaches ChatPanel
affects:
  - App.tsx
  - components/App
  - components/ChatPanel.tsx
  - src/app/hooks
  - test/components
  - test/services
tech-stack:
  added: []
  patterns:
    - thread notebook grounding choices as explicit app state instead of hiding them inside hook defaults
    - treat component parity tests as compile-time contract guards when ChatPanel props evolve
key-files:
  created:
    - test/components/AppChatContextThreading.test.tsx
  modified:
    - App.tsx
    - components/App/AppShell.tsx
    - components/App/AppWorkspace.tsx
    - components/ChatPanel.tsx
    - src/app/hooks/useAIWorkflow.ts
    - src/app/hooks/useAppWorkspaceState.ts
    - test/services/inAppAssistantWorkspaceContextControls.test.ts
    - test/components/ChatPanelParity.test.tsx
decisions:
  - Keep `contextScope` and `includeSelectedText` as app-owned state and thread them to ChatPanel instead of recomputing them inside the runtime hook.
  - Preserve compatibility by updating existing parity tests when ChatPanel contracts change, rather than weakening type coverage around the chat shell.
requirements-completed:
  - APP-01
completed: 2026-03-30T10:45:54+08:00
---

# Phase 04 Plan 06: Explicit Workspace Context Threading Summary

The in-app assistant now carries explicit workspace-context choices from the app shell into ChatPanel and shared-runtime request assembly, so later UI work can expose notebook grounding controls without reopening runtime plumbing.

## Outcome

Tasks completed: 2/2

- Threaded `contextScope` and `includeSelectedText` through `App.tsx`, `AppShell`, `AppWorkspace`, and `ChatPanel`.
- Updated `useAppWorkspaceState` and `useAIWorkflow` so focused-note versus open-panes grounding and selected-text injection are explicit runtime inputs.
- Added a component-level `AppChatContextThreading` proof and expanded the runtime control tests to lock the new contract in place.

## Verification

- `bun run vitest run test/services/inAppAssistantWorkspaceContext.test.ts test/services/inAppAssistantWorkspaceContextControls.test.ts test/components/AppChatContextThreading.test.tsx`
- `bun run tsc --noEmit`

## Task Commits

1. `a7eb889` `test(04-06): add failing workspace context control tests`
2. `d257099` `feat(04-06): thread explicit workspace context controls`
3. `28a08e7` `test(04-06): add app shell chat context threading coverage`

## Files Created/Modified

- `App.tsx` - Owns the new context-scope and selected-text control state for the app chat surface.
- `components/App/AppShell.tsx` - Threads explicit workspace context controls through the shell boundary.
- `components/App/AppWorkspace.tsx` - Passes the workspace context contract into the main chat surface.
- `components/ChatPanel.tsx` - Accepts explicit context control props needed by follow-on UI work.
- `src/app/hooks/useAIWorkflow.ts` - Uses explicit context choices when assembling runtime requests.
- `src/app/hooks/useAppWorkspaceState.ts` - Produces typed workspace context with explicit scope and selected-text inclusion.
- `test/services/inAppAssistantWorkspaceContextControls.test.ts` - Verifies focused-note versus open-panes grounding and selected-text injection behavior.
- `test/components/AppChatContextThreading.test.tsx` - Verifies the app-shell route reaches ChatPanel with the threaded context controls.
- `test/components/ChatPanelParity.test.tsx` - Keeps existing chat-shell parity coverage compatible with the expanded ChatPanel prop contract.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated ChatPanel parity coverage to match the expanded prop contract**
- **Found during:** Task 2 (Add a component/integration proof that app-shell state reaches ChatPanel)
- **Issue:** `bun run tsc --noEmit` failed because `test/components/ChatPanelParity.test.tsx` no longer satisfied the new required `workspaceContext`, `contextScope`, and `includeSelectedText` props.
- **Fix:** Updated the parity test render helper to pass the new explicit context props and adjusted the new threading tests to assert the real workspace-context shape.
- **Files modified:** `test/components/AppChatContextThreading.test.tsx`, `test/components/ChatPanelParity.test.tsx`, `test/services/inAppAssistantWorkspaceContextControls.test.ts`
- **Verification:** `bun run vitest run test/services/inAppAssistantWorkspaceContext.test.ts test/services/inAppAssistantWorkspaceContextControls.test.ts test/components/AppChatContextThreading.test.tsx` and `bun run tsc --noEmit`
- **Committed in:** `28a08e7`

---

**Total deviations:** 1 auto-fixed (Rule 3 - Blocking)
**Impact on plan:** No scope creep. The extra test updates were required to keep the widened ChatPanel contract type-safe and verifiable.

## Next Phase Readiness

04-07 can now surface the actual workspace-context controls in the chat UI without reopening shell/runtime wiring. The remaining APP-02 work is visible discoverability and composer usability, not runtime contract plumbing.

## Self-Check: PASSED
