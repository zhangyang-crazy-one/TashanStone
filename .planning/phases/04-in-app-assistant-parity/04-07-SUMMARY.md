---
phase: 04-in-app-assistant-parity
plan: 07
subsystem: chat-surface-ui
tags:
  - in-app
  - chat
  - workspace-context
  - composer
  - ui
  - testing
requires:
  - 04-06
provides:
  - Visible workspace-context controls on the main chat surface
  - Multiline auto-growing chat composer with explicit enter versus shift-enter behavior
  - Regression coverage proving the chat shell preserves notebook-centric actions while adding the new UI
affects:
  - components/ChatPanel.tsx
  - components/ChatPanel/ChatHeader.tsx
  - components/ChatPanel/ChatInput.tsx
  - components/ChatPanel/WorkspaceContextPanel.tsx
  - utils/translations.ts
  - test/components
tech-stack:
  added: []
  patterns:
    - surface workspace grounding as visible chat controls instead of hiding it behind hook defaults
    - use auto-growing textarea composers to preserve long prompts and voice/injected message flows on the same chat shell
key-files:
  created:
    - components/ChatPanel/WorkspaceContextPanel.tsx
    - test/components/WorkspaceContextPanel.test.tsx
    - test/components/ChatInput.test.tsx
  modified:
    - components/ChatPanel.tsx
    - components/ChatPanel/ChatHeader.tsx
    - components/ChatPanel/ChatInput.tsx
    - test/components/ChatPanelParity.test.tsx
    - utils/translations.ts
decisions:
  - Put workspace context controls behind a visible chat-header entry point so users can inspect grounding before sending prompts.
  - Switch the composer from a single-line input to an auto-growing textarea while preserving Enter-to-send and Shift+Enter newline behavior.
requirements-completed: []
completed: 2026-03-30T11:01:59+08:00
---

# Phase 04 Plan 07: Visible Workspace Context And Multiline Composer Summary

The in-app assistant chat surface now exposes notebook grounding controls in the UI and preserves long prompts with a multiline auto-growing composer instead of clipping them inside a single-line input.

## Outcome

Tasks completed: 2/2

- Added `WorkspaceContextPanel` plus a chat-header entry point that shows active note scope, open panes, and highlighted-text inclusion controls before submit.
- Replaced the single-line composer with a multiline textarea that auto-grows and keeps `Enter` submit versus `Shift+Enter` newline behavior explicit.
- Expanded parity coverage so the visible context controls, voice append flow, and injected-message flow continue to coexist in the same chat shell.

## Verification

- `bun run vitest run test/components/WorkspaceContextPanel.test.tsx test/components/ChatInput.test.tsx test/components/ChatPanelParity.test.tsx`
- `bun run tsc --noEmit`

## Task Commits

1. `dfceb8f` `test(04-07): add failing workspace context surface tests`
2. `d0c42e5` `feat(04-07): surface workspace context controls in chat`
3. `a3b9c09` `test(04-07): add failing multiline composer tests`
4. `eb22ea5` `feat(04-07): switch chat composer to multiline textarea`

## Files Created/Modified

- `components/ChatPanel/WorkspaceContextPanel.tsx` - Renders the visible notebook-grounding controls and previews active context facts.
- `components/ChatPanel/ChatHeader.tsx` - Adds the discoverable entry point for workspace context controls.
- `components/ChatPanel/ChatInput.tsx` - Implements the multiline auto-growing textarea composer and submit/newline behavior.
- `components/ChatPanel.tsx` - Wires the visible context panel and multiline composer into the main chat surface.
- `utils/translations.ts` - Adds user-facing copy for the workspace context control labels.
- `test/components/WorkspaceContextPanel.test.tsx` - Verifies visible context facts and control behavior.
- `test/components/ChatInput.test.tsx` - Verifies multiline composer wrapping and keyboard behavior.
- `test/components/ChatPanelParity.test.tsx` - Verifies voice append, injected messages, and parity shell behavior still work with the new UI.

## Deviations from Plan

None - plan executed exactly as written.

## Next Phase Readiness

04-08 can now focus only on discoverability of isolated threads and live runtime activity. Workspace context controls and multiline prompt entry are already present on the default chat surface.

## Self-Check: PASSED
