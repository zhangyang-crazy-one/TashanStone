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
  - Live runtime visibility that surfaces streaming phase and delta activity without hidden icon-only discovery
  - Final parity coverage for context controls, runtime visibility, and preserved notebook-centric actions
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
    - explain isolated chat sessions with explicit thread copy instead of generic session labels
    - auto-surface runtime inspection during active phases while keeping the panel manually inspectable afterward
key-files:
  created:
    - test/components/AssistantSessionBar.test.tsx
    - test/components/RuntimeInspectorPanel.test.tsx
  modified:
    - components/ChatPanel.tsx
    - components/ChatPanel/ChatHeader.tsx
    - components/ChatPanel/AssistantSessionBar.tsx
    - components/ChatPanel/RuntimeInspectorPanel.tsx
    - test/components/ChatPanelParity.test.tsx
    - utils/translations.ts
decisions:
  - Frame in-app conversations as isolated threads with explicit explanatory copy so users can understand separation of history and context at a glance.
  - Promote runtime visibility to a labeled live-runtime control with phase and delta badges, and auto-open the inspector while activity is in-flight.
requirements-completed:
  - APP-02
  - APP-03
completed: 2026-03-30T11:20:03+08:00
---

# Phase 04 Plan 08: Discoverable Threads And Live Runtime Visibility Summary

The in-app assistant now explains isolated threads plainly and surfaces live runtime activity from the default chat surface, completing the user-facing parity work without regressing notebook-centric actions.

## Outcome

Tasks completed: 2/2

- Reworked the session strip into explicit isolated-thread UX with active-thread labeling and explanatory copy about separate history and context.
- Promoted runtime visibility from a hidden inspector icon to a labeled live-runtime control with phase and delta badges, and auto-surfaced the inspector during active phases.
- Extended final parity coverage so visible context controls, thread discoverability, live runtime state, voice append, and injected-message flows all coexist in the same chat shell.

## Verification

- `bun run vitest run test/components/AssistantSessionBar.test.tsx test/components/RuntimeInspectorPanel.test.tsx test/components/ChatPanelParity.test.tsx`
- `bun run tsc --noEmit`

## Task Commits

1. `a6a162b` `test(04-08): add failing thread discoverability tests`
2. `7cbb295` `feat(04-08): clarify isolated chat threads`
3. `0ab0850` `test(04-08): add failing live runtime visibility tests`
4. `2380e21` `feat(04-08): surface live runtime activity`

## Files Created/Modified

- `components/ChatPanel/AssistantSessionBar.tsx` - Reframes sessions as isolated threads with active-thread affordances and explanatory copy.
- `components/ChatPanel/ChatHeader.tsx` - Adds the labeled live-runtime control and phase/delta badges.
- `components/ChatPanel/RuntimeInspectorPanel.tsx` - Presents live runtime details, last delta, last update, and assembled context in a clearer read-only layout.
- `components/ChatPanel.tsx` - Auto-surfaces the runtime inspector during active phases and threads inspection state into the header.
- `utils/translations.ts` - Adds the user-facing thread and live-runtime copy in English and Chinese.
- `test/components/AssistantSessionBar.test.tsx` - Verifies isolated-thread copy and active-thread discoverability.
- `test/components/RuntimeInspectorPanel.test.tsx` - Verifies live runtime fields and idle-state visibility.
- `test/components/ChatPanelParity.test.tsx` - Verifies thread discoverability, live runtime visibility, and preserved notebook-centric chat actions together.

## Deviations from Plan

None - plan executed exactly as written.

## Next Phase Readiness

Phase 04 gap-closure work is complete. The in-app assistant now has truthful settings, explicit workspace context controls, a multiline composer, discoverable isolated threads, and visible runtime activity, so the phase is ready for phase-level verification and completion.

## Self-Check: PASSED
