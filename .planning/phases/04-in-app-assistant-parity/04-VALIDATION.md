---
phase: 04
slug: in-app-assistant-parity
status: ready
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-30
---

# Phase 04 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `bun run vitest run <targeted-tests>` |
| **Full suite command** | `bun run vitest run` |
| **Estimated runtime** | ~30 to 45 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun run vitest run <targeted-tests>`
- **After every plan wave:** Run `bun run tsc --noEmit && bun run vitest run <wave-targets>`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | APP-02 | unit | `bun run vitest run test/services/assistantRuntimeInspection.contracts.test.ts` | ✅ planned | ⬜ pending |
| 04-01-02 | 01 | 1 | APP-01, APP-02 | integration | `bun run vitest run test/services/inAppAssistantInspectionBridge.test.ts && bun run tsc --noEmit` | ✅ planned | ⬜ pending |
| 04-02-01 | 02 | 2 | APP-01, APP-03 | integration | `bun run vitest run test/services/inAppAssistantWorkspaceContext.test.ts` | ✅ planned | ⬜ pending |
| 04-02-02 | 02 | 2 | APP-01, APP-03 | integration | `bun run vitest run test/services/inAppAssistantWorkflowParity.test.ts && bun run tsc --noEmit` | ✅ planned | ⬜ pending |
| 04-03-01 | 03 | 3 | APP-02 | component | `bun run vitest run test/components/AssistantSessionBar.test.tsx` | ✅ planned | ⬜ pending |
| 04-03-02 | 03 | 3 | APP-02 | component | `bun run vitest run test/components/RuntimeInspectorPanel.test.tsx && bun run tsc --noEmit` | ✅ planned | ⬜ pending |
| 04-04-01 | 04 | 4 | APP-03 | integration | `bun run vitest run test/services/inAppAssistantParityRegression.test.ts` | ✅ planned | ⬜ pending |
| 04-04-02 | 04 | 4 | APP-01, APP-03 | component | `bun run vitest run test/components/ChatPanelParity.test.tsx && bun run tsc --noEmit` | ✅ planned | ⬜ pending |
| 04-05-01 | 05 | 1 | APP-01 | integration | `bun run vitest run test/services/assistantSettingsPersistence.test.tsx && bun run tsc --noEmit` | ✅ planned | ⬜ pending |
| 04-05-02 | 05 | 1 | APP-01 | component | `bun run vitest run test/components/AISettingsModalPresentation.test.tsx` | ✅ planned | ⬜ pending |
| 04-06-01 | 06 | 2 | APP-01, APP-02 | integration | `bun run vitest run test/services/inAppAssistantWorkspaceContext.test.ts test/services/inAppAssistantWorkspaceContextControls.test.ts` | ✅ planned | ⬜ pending |
| 04-06-02 | 06 | 2 | APP-02 | component | `bun run vitest run test/components/AppChatContextThreading.test.tsx` | ✅ planned | ⬜ pending |
| 04-07-01 | 07 | 3 | APP-01, APP-02, APP-03 | component | `bun run vitest run test/components/WorkspaceContextPanel.test.tsx test/components/ChatPanelParity.test.tsx` | ✅ planned | ⬜ pending |
| 04-07-02 | 07 | 3 | APP-03 | component | `bun run vitest run test/components/ChatInput.test.tsx test/components/ChatPanelParity.test.tsx && bun run tsc --noEmit` | ✅ planned | ⬜ pending |
| 04-08-01 | 08 | 4 | APP-02, APP-03 | component | `bun run vitest run test/components/AssistantSessionBar.test.tsx test/components/ChatPanelParity.test.tsx` | ✅ planned | ⬜ pending |
| 04-08-02 | 08 | 4 | APP-02, APP-03 | component | `bun run vitest run test/components/RuntimeInspectorPanel.test.tsx test/components/ChatPanelParity.test.tsx && bun run tsc --noEmit` | ✅ planned | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] Existing Vitest and TypeScript infrastructure already cover Phase 4 verification needs.
- [x] Phase 2 and Phase 3 already proved the canonical session model and runtime event substrate, so no new pre-phase framework work is required.
- [x] The new validation work is limited to targeted service and component slices that Phase 4 plans intentionally introduce.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Assistant settings truthfulness after gap closure | APP-01 | implemented-vs-deferred settings presentation still needs human judgment | Open AI settings and verify only truthful, usable controls are presented by default, with no planning-state shell messaging shown as live product features |
| Workspace-context control clarity before submit | APP-01, APP-02 | note-scope clarity and selected-text preview readability are user-facing UX concerns | Open the chat drawer, inspect the workspace-context control, and verify the active note, scope choice, and selected-text status are understandable before sending a prompt |
| Multiline composer usability | APP-03 | keyboard feel and prompt readability are interaction concerns | Type a long prompt, verify it wraps and grows, then confirm `Enter` submits and `Shift+Enter` inserts a newline without regressing normal send behavior |
| Session-switching usability inside the chat drawer | APP-02 | session affordance clarity and interaction density need human judgment | Open the in-app assistant, create or switch between at least two sessions, and verify the active session is obvious before sending a message |
| Runtime inspector readability | APP-02 | context-section readability and information hierarchy are visual concerns | Open the runtime inspector during a streamed response and verify session facts, lifecycle state, and context summaries are understandable without reading console logs |
| Notebook workflow compatibility while parity UI is active | APP-03 | editor and notebook interactions are difficult to prove fully with isolated tests | Keep the parity-enhanced chat open while editing a note, running knowledge retrieval, and using memory injection or voice input, then verify no obvious workflow blockage or stale context behavior |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ready for execute-phase
