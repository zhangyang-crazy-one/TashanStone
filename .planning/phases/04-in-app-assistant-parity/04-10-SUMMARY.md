---
phase: 04-in-app-assistant-parity
plan: 10
subsystem: tui-chat-parity
tags:
  - tui
  - chat
  - streaming
  - sessions
  - multiline-input
requires:
  - phase: 04-09
    provides: truth-aligned Phase 04 parity baseline before TUI-specific gap closure
provides:
  - Discoverable isolated-thread controls on the real `tui-notebook` chat surface
  - Visible incremental delivery status with a working stream stop path
  - Multiline composer plus clear and compact transcript controls in TUI
affects:
  - tui-notebook/src/action.rs
  - tui-notebook/src/app.rs
  - tui-notebook/src/components/chat.rs
  - tui-notebook/src/services/ai.rs
  - tui-notebook/tests/test_ai_streaming.rs
  - tui-notebook/tests/test_chat_panel.rs
tech-stack:
  added: []
  patterns:
    - keep TUI chat state session-aware instead of one implicit global transcript
    - model streaming in the terminal as cancellable incremental delivery events
    - keep transcript hygiene in-surface with clear and compact actions rather than hidden maintenance paths
key-files:
  created:
    - tui-notebook/tests/test_ai_streaming.rs
    - tui-notebook/tests/test_chat_panel.rs
  modified:
    - tui-notebook/src/action.rs
    - tui-notebook/src/app.rs
    - tui-notebook/src/components/chat.rs
    - tui-notebook/src/services/ai.rs
key-decisions:
  - Treat `tui-notebook` as the real user-facing parity surface for this gap closure instead of assuming the React chat shell alone satisfies Phase 04.
  - Deliver user-visible streaming in TUI through cancellable incremental chunk emission even when the provider path is not yet native SSE streaming.
  - Expose thread switching and transcript controls directly inside the chat header so the terminal UI remains self-discoverable.
patterns-established:
  - "When a parity promise applies across surfaces, the terminal client must expose the same user-visible affordances instead of relying on hidden settings or React-only controls."
requirements-completed:
  - APP-01
  - APP-02
  - APP-03
duration: 22min
completed: 2026-03-30
---

# Phase 04 Plan 10: TUI Chat Gap Closure Summary

**The real `tui-notebook` chat surface now exposes session switching, visible streaming status, and multiline conversation controls that match the Phase 04 parity promises much more closely**

## Performance

- **Duration:** 22 min
- **Started:** 2026-03-30T04:30:13Z
- **Completed:** 2026-03-30T04:52:32Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Reworked TUI chat actions and app orchestration around session-aware operations, so chat requests, cancellation, clearing, compaction, and stream lifecycle events are routed per session instead of through one implicit transcript.
- Added visible TUI thread controls and runtime status rendering, including new-thread creation, next or previous session switching, active-session labels, and live status text in the chat header.
- Replaced the old single-line composer behavior with multiline input, discoverable shortcuts, and transcript-maintenance controls for clear, compact, and stop.
- Implemented incremental assistant delivery in `AiService` through chunked emission with cancellation support, so the TUI can visibly update the active assistant response instead of waiting for one final blob.
- Added targeted Rust tests that cover session isolation, multiline chat controls, and streaming chunk delivery behavior.

## Verification

- `cargo test --manifest-path tui-notebook/Cargo.toml chat_session`
- `cargo test --manifest-path tui-notebook/Cargo.toml multiline_chat`
- `cargo test --manifest-path tui-notebook/Cargo.toml chat_stream`
- `cargo test --manifest-path tui-notebook/Cargo.toml ai_stream`
- `cargo check --manifest-path tui-notebook/Cargo.toml`

## Files Created/Modified

- `tui-notebook/src/action.rs` - Expanded `ChatAction` into session-aware send, cancel, clear, compact, create-session, switch-session, and stream lifecycle variants.
- `tui-notebook/src/app.rs` - Routed chat requests by session, forwarded paste into the TUI composer, and managed cancellable background streaming tasks.
- `tui-notebook/src/components/chat.rs` - Added session-aware state, multiline composer rendering, visible runtime status, keyboard shortcuts, clear/compact handling, and thread switching UI hints.
- `tui-notebook/src/services/ai.rs` - Added incremental chunk emission helpers and a cancellable `chat_streaming(...)` path.
- `tui-notebook/tests/test_chat_panel.rs` - Added interaction coverage for session switching, multiline input, clear/compact, and stop behavior.
- `tui-notebook/tests/test_ai_streaming.rs` - Added streaming chunking and cancellation coverage.

## Decisions Made

- Kept session visibility tied to runtime config (`session_policy`, `streaming_enabled`) so the TUI does not advertise controls the saved settings disable.
- Preserved partial assistant output on stop instead of deleting it, which is the least surprising terminal behavior during cancellation.
- Used deterministic transcript compaction that summarizes older turns into a synthetic system message while keeping recent exchange context visible.

## Deviations from Plan

- The streaming implementation is a pragmatic incremental-delivery layer over the existing final-response path, not a provider-native token stream yet.
- `tui-notebook/src/i18n.rs` did not require dedicated changes because the gap closure localized the new labels inside the chat component.

## Issues Encountered

- The previous Phase 04 verification report was React-surface-centric and did not reflect the actual TUI gaps the user surfaced during manual audit. This summary and the updated verification record supersede that assumption.

## User Setup Required

- Manual TUI re-verification is still required for the three previously failed checks: thread switching, visible streaming, and multiline/control usability.

## Next Phase Readiness

- `04-10-PLAN.md` is implemented and locally verified.
- Phase 04 should not be closed again until the user reruns Chinese UAT on the actual `tui-notebook` surface and confirms tests 3-5 now pass.

## Self-Check: PASSED
