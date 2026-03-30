---
phase: 03
slug: tools-and-multimodal-delivery
status: ready
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-29
---

# Phase 03 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `bun run vitest run <targeted-tests>` |
| **Full suite command** | `bun run vitest run` |
| **Estimated runtime** | ~30 seconds |

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
| 03-01-01 | 01 | 1 | TOOL-01, TOOL-02, TOOL-03 | unit | `bun run vitest run test/services/assistantToolRuntimeContracts.test.ts` | ✅ planned | ⬜ pending |
| 03-01-02 | 01 | 1 | TOOL-03 | unit | `bun run vitest run test/services/assistantDeliveryPolicyContracts.test.ts` | ✅ planned | ⬜ pending |
| 03-02-01 | 02 | 2 | TOOL-01 | integration | `bun run vitest run test/services/assistantToolExecution.test.ts` | ✅ planned | ⬜ pending |
| 03-02-02 | 02 | 2 | TOOL-04 | integration | `bun run vitest run test/services/assistantToolStatusFlow.test.ts` | ✅ planned | ⬜ pending |
| 03-03-01 | 03 | 3 | TOOL-02 | unit | `bun run vitest run test/services/assistantMultimodalNormalization.test.ts` | ✅ planned | ⬜ pending |
| 03-03-02 | 03 | 3 | TOOL-02, TOOL-04 | integration | `bun run vitest run test/services/assistantMediaStatusFlow.test.ts` | ✅ planned | ⬜ pending |
| 03-04-01 | 04 | 4 | TOOL-03 | integration | `bun run vitest run test/services/inAppAssistantDeliveryPolicy.test.ts` | ✅ planned | ⬜ pending |
| 03-04-02 | 04 | 4 | TOOL-04 | integration | `bun run vitest run test/services/inAppAssistantToolMediaStatus.test.ts && bun run tsc --noEmit` | ✅ planned | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] Existing Vitest and TypeScript infrastructure already cover framework/config needs for this phase.
- [x] Contract-basis tests are created in Plan 03-01, so no separate pre-phase Wave 0 work is required.
- [x] Missing verification files are intentionally introduced by the matching execution plans above; there is no unplanned infrastructure gap.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Tool/media status readability in the existing assistant UI | TOOL-04 | visual clarity and UX fit are hard to prove in unit tests | Trigger a tool run and a media-processing flow in the app, then verify progress/error/success states are legible and non-silent |
| Delivery chunk readability under different policy profiles | TOOL-03 | readability and profile defaults still need human judgment | Trigger a long assistant response under at least two policy profiles, then verify chunk order, clarity, and no obvious truncation/code-fence breakage artifacts |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ready for execute-phase
