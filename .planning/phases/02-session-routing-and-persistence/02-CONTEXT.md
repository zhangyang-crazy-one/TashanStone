# Phase 2: Session Routing and Persistence - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 2 turns the Phase 1 runtime into a reusable conversation substrate by adding stable assistant session identity, route resolution, activation policy, and durable session persistence.

This phase is not the full in-app assistant parity pass and it is not the WhatsApp / QQ Channel delivery phase. The job here is to build the shared session and routing layer that later in-app and channel surfaces can both rely on.

</domain>

<decisions>
## Implementation Decisions

- **D-01:** Phase 2 must introduce a canonical assistant session model that survives across requests. Callers must stop generating disposable session ids for each request when they mean to continue one conversation.
- **D-02:** Session identity, route identity, and persistence identity must be explicit and separate from UI-local message arrays or localStorage-only chat history.
- **D-03:** Direct app conversations should resolve to a stable primary session model, while group or channel thread routes must stay isolated by route key and thread metadata.
- **D-04:** Activation and routing rules must be transport-agnostic and data-driven so later WhatsApp and QQ Channel adapters can use them without forking assistant core logic.
- **D-05:** Reply context must become a first-class persisted concept rather than an ad hoc transport field, because later channel replies need to resume the right session and thread safely.
- **D-06:** Existing SQLite chat history, checkpoints, compacted sessions, and context persistence seams should be reused or migrated forward instead of replaced with a second storage system.
- **D-07:** The current single-key localStorage chat history (`neon-chat-history`) is not an acceptable Phase 2 source of truth for assistant conversations.
- **D-08:** Electron and web storage backends must expose the same session-oriented storage interface, even if the web backend uses a simplified implementation.
- **D-09:** Phase 2 may add the minimum app-side session lifecycle wiring needed to prove isolation and resume behavior, but it must not absorb the full session UI / inspector / parity work reserved for later phases.
- **D-10:** Notebook-native behavior from Phase 1 must keep working; session routing must wrap the runtime, not break notebook context injection or tool execution.
- **D-11:** Any new session or routing metadata surfaced in user-facing settings or shell state must remain data-driven and compatible with the bilingual direction established in Phase 1.
- **D-12:** Plugins and Skills remain independent operator settings sections from Phase 1, but their concrete implementation is out of scope for Phase 2.

### the agent's Discretion

- Exact table and repository boundaries for canonical session persistence
- Exact route-key format and participant metadata shape
- Exact migration strategy from `conversation_id` toward the canonical session model
- Exact minimal app-facing hooks or shell state needed to prove session isolation
- Exact decomposition of repository work versus routing-policy work

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap and phase contract
- `.planning/ROADMAP.md` — Phase 2 goal, dependencies, and success criteria
- `.planning/REQUIREMENTS.md` — `SESS-01` through `SESS-04`
- `.planning/PROJECT.md` — core value, scope limits, and evolution rules
- `.planning/STATE.md` — validated Phase 1 decisions and current project position

### Phase 1 outputs that Phase 2 must build on
- `.planning/phases/01-assistant-runtime-foundation/01-VERIFICATION.md` — verified runtime, storage, and app wiring baseline
- `src/services/assistant-runtime/types.ts` — shared runtime request and `AssistantSessionRef` surface
- `src/services/assistant-runtime/createAssistantRuntime.ts` — current runtime execution boundary
- `src/app/hooks/useAIWorkflow.ts` — current caller adapter that still generates ephemeral app session ids

### Existing chat, storage, and context persistence seams
- `src/app/hooks/useChatHistory.ts` — current single-conversation localStorage chat history
- `src/services/storage/types.ts` — shared storage interface that Phase 2 must extend
- `src/services/storage/electronStorage.ts` — Electron-backed storage service
- `src/services/storage/webStorage.ts` — web fallback storage service
- `electron/database/repositories/chatRepository.ts` — existing chat and compacted-session persistence
- `electron/database/repositories/contextRepository.ts` — checkpoint storage bridge over chat repository
- `electron/ipc/dbHandlers.ts` — current db chat IPC surface
- `electron/ipc/contextHandlers.ts` — existing context/checkpoint IPC handlers
- `electron/database/schema.sql` — current canonical SQLite schema
- `electron/database/migrations.ts` — migration history and existing context tables
- `src/services/context/manager.ts` — current context manager session behavior

### Product and architecture research
- `.planning/research/openclaw-initial-analysis.md` — shared session and routing implications from OpenClaw analysis
- `.planning/research/SUMMARY.md` — recommended build order and shared session responsibilities
- `.planning/research/PHASE1-RUNTIME-RESEARCH.md` — Phase 1 session service rationale and caller/session separation

</canonical_refs>

<specifics>
## Specific Ideas

- Replace per-request `app-chat-${requestId}` session ids in `useAIWorkflow` with a stable app session lifecycle.
- Introduce a canonical session record that can capture route kind, route key, origin, scope, status, and reply-context metadata.
- Reconcile the current `conversation_id` chat persistence with the runtime's `AssistantSessionRef`.
- Normalize direct conversations versus group/channel thread sessions before actual channel adapters ship.
- Persist enough reply metadata now that later WhatsApp / QQ Channel work can continue the same session instead of inventing another persistence seam.
- Keep the app-facing work Phase-2-sized: session-aware history and lifecycle hooks are enough; full session browsing UX can wait.

</specifics>

<deferred>
## Deferred Ideas

- Full in-app session browser, transcript inspector, or parity UI polish
- Actual WhatsApp or QQ Channel auth, webhook, and delivery implementation
- Multimodal normalization and outbound chunking policy delivery
- Safety policy enforcement for non-primary sessions
- Plugins / Skills runtime implementation

</deferred>

---

*Phase: 02-session-routing-and-persistence*
*Context gathered: 2026-03-29*
