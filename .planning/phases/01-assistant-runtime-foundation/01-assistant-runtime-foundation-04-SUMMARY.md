---
phase: 01-assistant-runtime-foundation
plan: 04
subsystem: infra
tags: [assistant-runtime, react, vitest, context-assembly, rag]
requires:
  - phase: 01-assistant-runtime-foundation-02
    provides: shared runtime execution and adapter-driven context assembly contracts
  - phase: 01-assistant-runtime-foundation-03
    provides: in-app runtime caller adapter and persisted phase-1 app wiring
provides:
  - production notebook, workspace, and knowledge adapter builders for assistant runtime context assembly
  - shared notebook context assembler factory reusable by in-app and later non-UI callers
  - in-app runtime construction wired to real file and vector-search dependencies instead of empty assembler defaults
affects: [02-session-routing-and-persistence, 04-in-app-assistant-parity, channel-adapters]
tech-stack:
  added: []
  patterns: [production context-adapter factory, runtime-owned notebook context assembly, hook-as-caller-adapter]
key-files:
  created:
    - src/services/assistant-runtime/contextAdapters.ts
  modified:
    - src/services/assistant-runtime/contextAssembler.ts
    - src/services/assistant-runtime/index.ts
    - src/app/hooks/useAIWorkflow.ts
    - test/services/assistantRuntime.context.test.ts
    - test/services/inAppAssistantRuntimeAdapter.test.ts
key-decisions:
  - "Ship notebook/workspace/knowledge adapter builders inside the runtime layer so production callers register real context sources instead of test-local adapters."
  - "Keep useAIWorkflow as a caller adapter by passing refs and vector-search callbacks into createNotebookContextAssembler rather than re-owning context assembly in the hook."
  - "Resolve knowledge context with the latest AI config through a ref so runtime-backed searches stay aligned with the current provider settings."
patterns-established:
  - "Production callers should instantiate createAssistantRuntime({ contextAssembler: createNotebookContextAssembler(...) }) instead of relying on the empty default assembler."
  - "Notebook notes, workspace state, and knowledge search dependencies can be supplied as callbacks or plain data, keeping the runtime React-free."
requirements-completed: [CORE-03, CORE-04]
duration: 6min
completed: 2026-03-28
---

# Phase 1 Plan 4: Assistant Runtime Foundation Summary

**Production notebook context adapter builders and in-app runtime wiring that assemble real notes, workspace state, and vector-search knowledge before execution**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-28T13:15:11+08:00
- **Completed:** 2026-03-28T13:21:05+08:00
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Added shipped notebook, workspace, and knowledge adapter builders plus a shared `createNotebookContextAssembler()` factory under `src/services/assistant-runtime`.
- Filtered empty adapter payloads out of the runtime prompt path so production callers only inject real context sections.
- Wired `useAIWorkflow` to construct its runtime with the production assembler and real notebook/vector-search dependencies instead of the empty default assembler.

## Task Commits

Each task was committed atomically:

1. **Task 1: Build the production notebook/workspace/knowledge adapter factory** - RED: `14f9909` (`test`), GREEN: `209117c` (`feat`)
2. **Task 2: Wire the in-app caller to the production adapter-backed assembler** - RED: `a11e014` (`test`), GREEN: `60d36d5` (`feat`)

_Note: both tasks followed TDD with separate failing-test and implementation commits._

## Files Created/Modified
- `src/services/assistant-runtime/contextAdapters.ts` - production adapter builders and shared notebook context assembler factory
- `src/services/assistant-runtime/contextAssembler.ts` - drops empty adapter payloads before prompt composition
- `src/services/assistant-runtime/index.ts` - re-exports the production context adapter factory surface
- `src/app/hooks/useAIWorkflow.ts` - constructs the in-app runtime with file-backed, workspace-backed, and knowledge-backed context dependencies
- `test/services/assistantRuntime.context.test.ts` - proves production adapters assemble notebook notes, workspace state, and knowledge context for reusable callers
- `test/services/inAppAssistantRuntimeAdapter.test.ts` - locks the in-app constructor path to a non-empty context assembler and real notebook/knowledge dependencies

## Decisions Made

- Put the production adapter registration seam in `contextAdapters.ts` so later CLI or channel callers can reuse the same context assembly path without importing React hooks.
- Kept the hook’s responsibility limited to dependency wiring and event translation; notebook context composition remains owned by runtime adapters.
- Reused the existing vector-store search contract for knowledge context instead of adding a second RAG path inside the runtime layer.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Normalized sync-or-async provider assertions in the new in-app regression test**
- **Found during:** Task 2 (Wire the in-app caller to the production adapter-backed assembler)
- **Issue:** The new regression used `.resolves` directly on providers that may return plain values, causing the verification test itself to fail.
- **Fix:** Wrapped provider calls in `Promise.resolve(...)` so the regression accepts both sync and async dependency providers, matching the runtime contract.
- **Files modified:** `test/services/inAppAssistantRuntimeAdapter.test.ts`
- **Verification:** `bun run vitest run test/services/inAppAssistantRuntimeAdapter.test.ts test/services/assistantRuntime.context.test.ts`
- **Committed in:** `60d36d5`

**2. [Rule 3 - Blocking] Corrected the runtime type import in the hook**
- **Found during:** Task 2 (Wire the in-app caller to the production adapter-backed assembler)
- **Issue:** `bun run tsc --noEmit` failed because `AssistantRuntime` is not exported from the root `types` barrel.
- **Fix:** Imported `AssistantRuntime` as a type from `@/src/services/assistant-runtime`, which is the actual export surface for the runtime contract.
- **Files modified:** `src/app/hooks/useAIWorkflow.ts`
- **Verification:** `bun run tsc --noEmit`
- **Committed in:** `60d36d5`

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both fixes were required to complete the planned verification path. No scope creep beyond the gap-closure goal.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 1 now has production runtime wiring for notebook-native context injection, which closes the verified CORE-03 gap.
- Phase 2 can build session routing and persistence on top of a runtime path that already works for real app callers and reusable non-UI adapter factories.

## Self-Check

PASSED

- FOUND: `.planning/phases/01-assistant-runtime-foundation/01-assistant-runtime-foundation-04-SUMMARY.md`
- FOUND: `14f9909`
- FOUND: `209117c`
- FOUND: `a11e014`
- FOUND: `60d36d5`
