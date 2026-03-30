---
phase: 04-in-app-assistant-parity
plan: 08
subsystem: chat-discoverability
tags:
  - in-app
  - chat
  - threads
  - runtime
  - streaming
  - ui
  - testing
requires:
  - 04-03
  - 04-07
provides:
  - Self-explanatory isolated-thread UX on the default chat surface
  - Live runtime visibility with labeled status and auto-surfaced inspection during active runs
  - Final parity coverage for context controls, voice/injected input flows, and notebook-centric chat actions
affects:
  - components/ChatPanel.tsx
  - components/ChatPanel/ChatHeader.tsx
  - components/ChatPanel/AssistantSessionBar.tsx
  - components/ChatPanel/RuntimeInspectorPanel.tsx
  - utils/translations.ts
  - test/components
tech-stack:
  added: []
  patterns:
    - explain isolated assistant sessions as threads instead of exposing raw session labels
    - auto-surface read-only runtime inspection during active phases while keeping manual toggle access afterward
key-files:
  created: []
  modified:
    - components/ChatPanel.tsx
    - components/ChatPanel/ChatHeader.tsx
    - components/ChatPanel/AssistantSessionBar.tsx
    - components/ChatPanel/RuntimeInspectorPanel.tsx
    - utils/translations.ts
    - test/components/AssistantSessionBar.test.tsx
    - test/components/RuntimeInspectorPanel.test.tsx
    - test/components/ChatPanelParity.test.tsx
decisions:
  - Keep the thread-discoverability rewrite on top of the canonical session callbacks and IDs instead of introducing local-only chat-thread state.
  - Promote runtime inspection into a labeled live-status control and auto-open the inspector for active lifecycle phases so streaming activity is visible without icon discovery.
patterns-established:
  - "Assistant session UX should explain isolation in user language while still delegating create/select operations to the shared runtime session model."
  - "Header-level observability controls should be labeled and stateful, not icon-only, when they represent parity-critical runtime behavior."
requirements-completed:
  - APP-02
  - APP-03
duration: 16min
completed: 2026-03-30T11:21:37+08:00
---

# Phase 04 Plan 08: Discoverable Threads And Live Runtime Visibility Summary

**Isolated chat threads with explicit separation copy, plus a labeled live-runtime surface that shows phase and delta activity directly inside the parity chat shell**

## Performance

- **Duration:** 16 min
- **Started:** 2026-03-30T03:06:00Z
- **Completed:** 2026-03-30T03:21:37Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Reworked the session strip into an isolated-thread surface with active-thread labeling and explicit copy that explains separate history and context.
- Replaced the hidden runtime icon with a labeled live-runtime control that exposes lifecycle and delta state in the header and auto-opens the inspector during active runs.
- Extended parity coverage so workspace-context controls, clear/compact actions, stop streaming, voice append, and injected-message flows remain intact after the final chat-shell rewrite.

## Task Commits

Each task was committed atomically:

1. **Task 1: Make isolated-thread session UX self-explanatory in the main chat surface** - `a6a162b` (test), `7cbb295` (feat)
2. **Task 2: Surface live runtime activity without requiring a hidden icon toggle** - `0ab0850` (test), `2380e21` (feat)

**Plan metadata:** pending final docs commit

## Files Created/Modified

- `components/ChatPanel/AssistantSessionBar.tsx` - Reframes sessions as isolated threads with explanatory copy and an active-thread affordance.
- `components/ChatPanel/ChatHeader.tsx` - Adds a labeled live-runtime control with visible phase and delta badges.
- `components/ChatPanel/RuntimeInspectorPanel.tsx` - Exposes last-delta and last-update details alongside existing session, lifecycle, and context inspection fields.
- `components/ChatPanel.tsx` - Auto-surfaces the runtime inspector while active lifecycle phases are in flight.
- `utils/translations.ts` - Adds English and Chinese thread/runtime discoverability strings.
- `test/components/AssistantSessionBar.test.tsx` - Verifies isolated-thread copy, active-thread labeling, and canonical callbacks.
- `test/components/RuntimeInspectorPanel.test.tsx` - Verifies live-runtime fields and idle-state visibility.
- `test/components/ChatPanelParity.test.tsx` - Verifies the final chat shell preserves context controls and notebook-centric actions while adding thread/runtime discoverability.

## Decisions Made

- Kept the discoverability work inside the existing chat drawer and canonical session model, preserving parity with the shared runtime instead of creating UI-owned thread state.
- Treated active runtime phases as the trigger for auto-surfacing the inspector, which keeps live execution obvious without forcing the panel open after activity has finished.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 04 gap-closure work is complete on the code path covered by this plan.
- The in-app assistant now presents truthful settings, visible workspace context, a multiline composer, discoverable isolated threads, and visible runtime activity on the default chat surface.

## Self-Check: PASSED

---
*Phase: 04-in-app-assistant-parity*
*Completed: 2026-03-30*
