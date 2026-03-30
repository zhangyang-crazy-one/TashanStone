# Phase 1: Assistant Runtime Foundation - Research

**Researched:** 2026-03-28
**Domain:** Shared assistant runtime extraction, notebook-context assembly, provider-agnostic execution
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Phase 1 must extract a shared runtime entrypoint out of the current UI-owned AI workflow.
- The runtime contract must stay transport-agnostic from day one so future callers can reuse it.
- Notebook context assembly belongs to the runtime substrate and must not depend on direct React state access.
- Planning must be driven by the current Pencil wireframes as well as runtime architecture.
- Settings IA is split into AI / operator settings and notebook / app settings.
- The operator settings IA now includes separate `plugins` and `skills` sections in both English and Chinese wireframes; planning must not fold them back into `tools` or `agents`.
- English and Chinese settings wireframes are both canonical; new strings and shortcuts must not be hardcoded.
- Phase 1 should model the designed runtime/config domains now, but it should not try to fully ship every settings page yet.
- Existing notebook workflows must keep working while the runtime is extracted.

### the agent's Discretion
- Exact service/module boundaries
- Exact persistence implementation details
- Exact adapter strategy for migrating the current in-app assistant caller
- Exact plan decomposition and wave ordering

### Deferred Ideas (OUT OF SCOPE)
- WhatsApp / QQ Channel adapter implementation
- Full in-app parity migration
- Full settings UI implementation
- Advanced graph/canvas parity and broader automation surfaces

</user_constraints>

<research_summary>
## Summary

The architectural bottleneck is already known: assistant orchestration is embedded in `src/app/hooks/useAIWorkflow.ts`, where UI message mutation, streaming, tool execution, notebook mutation, and model execution are mixed together. TashanStone already has most of the underlying ingredients needed for a reusable assistant runtime, including provider abstraction, streaming, context budgeting, memory, tool-call adapters, and persistence primitives.

That means Phase 1 should not research new model libraries first. It should extract a runtime boundary and define stable contracts between four concerns:
1. session ownership
2. context assembly
3. model execution and streaming
4. tool dispatch/results

The new planning constraint introduced by the current Pencil work is that runtime/config extraction cannot be blind infrastructure. The runtime, config schema, and storage contracts created in Phase 1 must align with the already-designed AI/operator settings and notebook/app settings surfaces, including bilingual labels. That alignment now explicitly includes separate `Plugins` and `Skills` operator sections in both languages, not just generic tools/agents buckets. The practical implication is that Phase 1 should create domain models and persistence surfaces that later UI work can consume without schema churn, while keeping the actual UI implementation scope narrow.

**Primary recommendation:** Plan Phase 1 as a runtime-extraction phase with an explicit configuration-schema track, then migrate exactly one current in-app caller onto the new runtime contract as proof.
</research_summary>

<architecture_patterns>
## Architecture Patterns

### Pattern 1: Runtime Core + Caller Adapters
**What:** Build a runtime service layer that owns request normalization, context assembly, execution, event streaming, and tool dispatch; expose adapters for each caller.
**When to use:** When existing code is UI-owned and future callers must reuse the same assistant behavior.
**Why it fits here:** It cleanly satisfies `CORE-01` and `CORE-04` while letting the chat panel remain the first migrated caller instead of the permanent owner.

### Pattern 2: Session Ref + Event Stream Contract
**What:** Define a stable `session` identity and a runtime event stream independent of React message arrays.
**When to use:** When more than one surface must share execution semantics and streaming behavior.
**Why it fits here:** It separates assistant state from UI rendering and prevents future channel adapters from tunneling through chat-panel state.

### Pattern 3: Context Adapter Boundary
**What:** Accept notebook/workspace inputs through adapters rather than directly reading component state or local storage inside runtime services.
**When to use:** When the same runtime must operate from multiple surfaces or platforms.
**Why it fits here:** It preserves notebook-native context injection while making runtime code testable and reusable.

### Pattern 4: Config Schema Before Full Settings UI
**What:** Introduce domain config types, defaults, storage, and translation-backed descriptors before building the full interface, including stable section ids for `plugins` and `skills`.
**When to use:** When design work is ahead of implementation and the UI spans many future pages.
**Why it fits here:** It lets Phase 1 honor the wireframes without overloading the phase with all settings-page implementation.

### Anti-Patterns to Avoid
- **UI-owned runtime:** leaving orchestration in hooks/components and wrapping it in thin helpers
- **Schema after UI:** building settings panels or hardcoded labels before a stable config model exists
- **One-off caller logic:** migrating the in-app caller with bespoke shims that future channels cannot reuse
- **All-settings-in-one-phase:** treating wireframes as a requirement to implement every screen now

</architecture_patterns>

<dont_hand_roll>
## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Provider abstraction | A second independent provider layer | Existing `services/aiService.ts` and `services/ai/aiStreamingPipeline.ts` | The provider substrate already exists; duplication creates drift |
| Tool-call parsing | New provider-specific tool parsing | Existing `services/toolCallAdapters.ts` | The normalization path already exists and should move under runtime |
| Context management | A brand new context subsystem | Existing `src/services/context/*` and `services/ai/aiMemoryPipeline.ts` | The app already has context budgeting, compaction, and memory layers |
| Translation support | New local label constants for settings/runtime | Existing `utils/translations.ts` plus structured metadata | Hardcoded strings already caused pain and will block bilingual UI work |

**Key insight:** The correct move is architectural extraction and contract design, not rebuilding primitives that TashanStone already has.
</dont_hand_roll>

<common_pitfalls>
## Common Pitfalls

### Pitfall 1: Moving code without changing ownership
**What goes wrong:** Logic gets copied from `useAIWorkflow.ts` into a service file, but UI message arrays still drive runtime state and event semantics.
**Why it happens:** Teams rename or relocate code without changing the dependency direction.
**How to avoid:** Define the runtime request, session, and event types first; then move orchestration behind them.
**Warning signs:** Service methods still accept React setters, UI message arrays, or component-only types.

### Pitfall 2: Letting Phase 1 absorb all settings UI
**What goes wrong:** Planning explodes into dozens of UI tasks because the wireframes are interpreted as “implement every page now.”
**Why it happens:** Design completeness gets mistaken for phase scope.
**How to avoid:** Separate Phase 1 schema/persistence work from later page implementation and only ship the minimum shell needed for runtime readiness.
**Warning signs:** Plans include every settings page, visual polish, and unrelated notebook features in the same phase.

### Pitfall 3: Hardcoding strings and shortcuts again
**What goes wrong:** New settings/runtime sections are backed by literal English labels or duplicated shortcut definitions, causing immediate drift from Chinese wireframes.
**Why it happens:** Metadata is attached directly to components instead of domain config descriptors.
**How to avoid:** Introduce typed metadata/config descriptors with translation keys and structured shortcut definitions.
**Warning signs:** New code stores display labels beside component logic or embeds shortcuts directly in JSX.

### Pitfall 4: Context injection coupled to a single caller
**What goes wrong:** Notebook context assembly depends on the current app state shape and cannot be reused by later callers.
**Why it happens:** Extraction focuses only on model execution, not on request normalization.
**How to avoid:** Build a caller-provided adapter boundary for notebook/workspace inputs and normalize before execution.
**Warning signs:** Runtime services import UI hooks, app containers, or browser-local storage directly.

</common_pitfalls>

<open_questions>
## Open Questions

1. **How much settings UI should ship in Phase 1?**
   - What we know: the user wants planning grounded in the Pencil wireframes, but the roadmap phase goal is runtime extraction.
   - What's unclear: whether Phase 1 should include a visible settings shell beyond config schema and persistence.
   - Recommendation: planner should keep full-page settings implementation out of scope, but can include one narrow shell/integration plan if it directly proves the new config model.

2. **Where should session persistence live initially?**
   - What we know: current chat history is UI-local and not sufficient for future shared callers.
   - What's unclear: whether Phase 1 should persist sessions in existing repositories immediately or start with a transient runtime/session registry plus compatibility adapter.
   - Recommendation: planner should choose the lowest-risk persistence step that still proves multiple caller compatibility and avoids UI-owned state.

3. **What is the smallest acceptable in-app migration proof?**
   - What we know: at least one existing caller should use the new runtime by the end of the phase.
   - What's unclear: whether this should be the current chat submission path only, or a second lightweight caller as well.
   - Recommendation: planner should include one real in-app adapter and one additional non-UI or alternate caller seam if feasible without swelling scope.

</open_questions>

<sources>
## Sources

### Primary (HIGH confidence)
- `.planning/research/PHASE1-RUNTIME-RESEARCH.md` — implementation-focused runtime analysis
- `.planning/research/SUMMARY.md` — synthesized OpenClaw research summary
- `.planning/research/openclaw-initial-analysis.md` — parity framing and scope constraints
- `.planning/ROADMAP.md` — Phase 1 goal and success criteria
- `.planning/REQUIREMENTS.md` — `CORE-01` to `CORE-04`
- `/home/zhangyangrui/pencil_designer/TUI_designer.pen` — current AI/operator and notebook/app settings wireframes, including separate Plugins/Skills pages in English and Chinese

### Codebase anchors
- `src/app/hooks/useAIWorkflow.ts`
- `src/app/hooks/useChatHistory.ts`
- `services/aiService.ts`
- `services/ai/aiStreamingPipeline.ts`
- `services/ai/aiMemoryPipeline.ts`
- `services/toolCallAdapters.ts`
- `src/services/context/*`
- `components/AISettingsModal/*`
- `utils/translations.ts`

</sources>

---

*Phase: 01-assistant-runtime-foundation*
*Research captured: 2026-03-28*
