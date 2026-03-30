---
phase: 04-in-app-assistant-parity
plan: 09
subsystem: chat-context-ui
tags:
  - in-app
  - chat
  - workspace-context
  - regression
  - testing
requires:
  - phase: 04-08
    provides: discoverable workspace-context and runtime inspection surfaces on the default chat shell
provides:
  - Human-readable active note titles threaded from AppWorkspace into the visible workspace-context panel
  - Regression coverage that rejects internal file ids as the active-note label when a title is available
affects:
  - components/App/AppWorkspace.tsx
  - components/ChatPanel.tsx
  - test/components/AppChatContextThreading.test.tsx
  - test/components/WorkspaceContextPanel.test.tsx
  - test/components/ChatPanelParity.test.tsx
tech-stack:
  added: []
  patterns:
    - source visible workspace labels from upstream note-title props instead of internal workspace ids
    - lock title truthfulness with both shell-threading tests and final rendered UI regressions
key-files:
  created: []
  modified:
    - components/App/AppWorkspace.tsx
    - components/ChatPanel.tsx
    - test/components/AppChatContextThreading.test.tsx
    - test/components/WorkspaceContextPanel.test.tsx
    - test/components/ChatPanelParity.test.tsx
key-decisions:
  - Keep `activeFileName` as the chat-surface source of truth for the visible active-note label instead of reusing `workspaceContext.activeFileId`.
  - Cover the fix at both the app-shell contract level and the rendered chat-shell level so the UI cannot silently regress back to opaque ids.
patterns-established:
  - "Visible assistant-context labels should prefer human-readable notebook metadata when it already exists upstream."
requirements-completed:
  - APP-02
duration: 8min
completed: 2026-03-30
---

# Phase 04 Plan 09: Active Note Title Truthfulness Summary

**App-shell note titles now flow into the visible workspace-context surface, with regressions that fail if the chat UI shows internal file ids instead of real note names**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-30T03:42:00Z
- **Completed:** 2026-03-30T03:50:20Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Threaded `activeFileName` from `AppWorkspace` into `ChatPanel`, so the visible workspace-context panel can render the real note title.
- Removed the last parity gap where `ChatPanel` fed `workspaceContext.activeFileId` into the active-note label path.
- Added regression assertions at the panel and final chat-shell levels to reject opaque note ids when a human-readable title is available.

## Task Commits

Each task was committed atomically:

1. **Task 1: Thread the real active note title from AppWorkspace into the visible workspace-context panel** - `0183273` (test), `5dcd22b` (feat)
2. **Task 2: Lock the visible active-note label with UI regressions that reject file-id fallbacks** - `4910a75` (test), `3e84d68` (test)

**Plan metadata:** pending final docs commit

## Files Created/Modified

- `components/App/AppWorkspace.tsx` - Threads the upstream `activeFileName` prop into `ChatPanel`.
- `components/ChatPanel.tsx` - Accepts `activeFileName` and passes it to `WorkspaceContextPanel` instead of substituting `activeFileId`.
- `test/components/AppChatContextThreading.test.tsx` - Verifies the app shell passes the real note title through the chat surface.
- `test/components/WorkspaceContextPanel.test.tsx` - Verifies the panel shows the note title and not the internal id when both exist.
- `test/components/ChatPanelParity.test.tsx` - Verifies the rendered parity shell surfaces the title and rejects the file id as the visible active-note label.

## Decisions Made

- Used the existing `activeFileName` app-shell prop as the single visible-label input instead of inventing a second title lookup path inside `ChatPanel`.
- Kept the regression work focused on title truthfulness only, without reopening unrelated parity, session, or runtime behavior.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 04 no longer has the active-note-title truthfulness gap called out in `04-VERIFICATION.md`.
- The in-app assistant parity surface now reports the active note with the real notebook title across both component-contract and visible-UI coverage.

## Self-Check: PASSED
