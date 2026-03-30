# Phase 2: Session Routing and Persistence - Research

**Researched:** 2026-03-29
**Domain:** Assistant session identity, routing policy, activation rules, and durable conversation persistence
**Confidence:** HIGH

<user_constraints>
## User Constraints (from ROADMAP.md, REQUIREMENTS.md, and prior phase outputs)

### Locked Decisions
- Phase 2 must satisfy `SESS-01`, `SESS-02`, `SESS-03`, and `SESS-04`.
- Conversations must stop behaving like one global in-app transcript and instead resolve through isolated assistant sessions.
- The session/routing layer must stay compatible with the shared runtime delivered in Phase 1.
- Direct conversations must map to a primary session model, while group and channel thread routes stay isolated.
- Activation and routing rules must exist before channel delivery, but actual WhatsApp / QQ Channel connectors remain out of scope for this phase.
- Session state, history, and reply context must persist through shared storage rather than UI-local localStorage.
- Existing SQLite chat/context persistence seams should be reused or evolved instead of duplicated.
- Phase 2 may add the minimum app wiring needed to prove session isolation and resume behavior, but it must not swallow full in-app assistant parity work.

### the agent's Discretion
- Exact session entity shape
- Exact database and repository decomposition
- Exact migration path from `conversation_id` to canonical assistant sessions
- Exact activation-policy format and evaluation order
- Exact number and wave ordering of execution plans

### Deferred Ideas (OUT OF SCOPE)
- WhatsApp / QQ Channel transport adapters
- Full session browser / multi-pane assistant UX
- Multimodal delivery policy and chunking
- Non-primary session safety restrictions
- Plugins / Skills implementation

</user_constraints>

<research_summary>
## Summary

The codebase already contains three different notions of "session", but they do not form one coherent system:

1. the runtime has `AssistantSessionRef`, but the in-app caller currently creates a new `app-chat-${requestId}` id for each request
2. chat persistence uses `conversation_id` in `chat_messages`
3. context engineering uses `session_id` for checkpoints and compacted sessions

At the same time, `useChatHistory.ts` still stores the main chat transcript in one browser key, `neon-chat-history`, which means current in-app conversation state is neither isolated nor durable in the way Phase 2 requires.

That makes Phase 2 primarily a unification phase, not a greenfield feature phase. The planning target is a single session model that coordinates:

1. route resolution
2. activation policy
3. persisted transcript and reply context
4. runtime session refs
5. minimal app lifecycle wiring

The strongest existing assets are already present:

- SQLite-backed `chatRepository` for transcript storage
- checkpoint and compacted-session persistence through `contextRepository`
- shared Electron/web storage abstraction
- runtime request/session contracts from Phase 1

The correct Phase 2 move is therefore to define a canonical session and route contract, then build one repository/store layer and one routing-policy layer on top of the current persistence seams, and finally wire the app caller/hook path to use stable sessions instead of transient request ids.

**Primary recommendation:** plan Phase 2 as four steps: session contracts and schema, persistence/store layer, routing and activation policy, then minimum app integration proving stable session reuse and isolated history.
</research_summary>

<architecture_patterns>
## Architecture Patterns

### Pattern 1: Canonical Session Record + Route Key
**What:** Define one persisted assistant session entity that stores session id, route kind, route key, origin, scope, lifecycle status, and reply-context metadata.
**When to use:** When multiple callers and transports need one source of truth for continuing conversations.
**Why it fits here:** It reconciles Phase 1 runtime session refs with existing `conversation_id` and `session_id` storage seams.

### Pattern 2: Session Repository + Storage Adapter Boundary
**What:** Put session metadata and transcript persistence behind repository/storage interfaces shared by Electron and web.
**When to use:** When durable persistence is needed without coupling callers directly to SQLite tables or localStorage keys.
**Why it fits here:** The repo already has `chatRepository`, `dbHandlers`, `preload`, and storage services that can be extended rather than replaced.

### Pattern 3: Router and Activation Policy Before Channel Delivery
**What:** Build a transport-neutral router that resolves route metadata into a session target, then applies activation rules before runtime execution.
**When to use:** When channels will arrive later but routing behavior must already be consistent.
**Why it fits here:** `SESS-02` and `SESS-03` require direct versus grouped route isolation and invoke/no-invoke policy before WhatsApp or QQ are implemented.

### Pattern 4: Session-Backed App History, Not Global Transcript State
**What:** Replace single-key chat history state with an active-session lifecycle and session-scoped transcript loading/saving.
**When to use:** When one app transcript today must become multiple isolated conversations tomorrow.
**Why it fits here:** `useChatHistory.ts` is still a single-global-history hook, which directly blocks `SESS-01` and `SESS-04`.

### Pattern 5: Reuse Existing Context Persistence
**What:** Keep checkpoints and compacted sessions keyed by canonical session id instead of inventing a second context-memory persistence path.
**When to use:** When transcript persistence and context persistence are already partly implemented but not unified.
**Why it fits here:** Phase 2 should unify the existing context tables with the canonical assistant session model, not fork them.

</architecture_patterns>

<dont_hand_roll>
## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Transcript persistence | A second standalone session database | Existing `chatRepository`, schema, and Electron IPC storage path | Current persistence already stores messages and should be evolved, not bypassed |
| Context resume | A parallel checkpoint persistence format | Existing `contextRepository` and `chat_checkpoints` / `compacted_sessions` tables | Phase 2 should unify identifiers, not duplicate checkpoint storage |
| App chat state | More hook-local single-history state | Shared storage service plus session-aware app hooks | Local-only history is the current failure mode |
| Channel routing logic | Transport-specific branches inside UI hooks | Session router and activation policy under `src/services/assistant-runtime/` | Channel adapters arrive later and need shared routing rules |

**Key insight:** The repo already has most of the persistence primitives; what is missing is the canonical session/router layer that makes them all point to the same identity model.
</dont_hand_roll>

<common_pitfalls>
## Common Pitfalls

### Pitfall 1: Treating `conversation_id` as already-good session architecture
**What goes wrong:** Existing chat rows get renamed conceptually, but no canonical session record or routing metadata is introduced.
**Why it happens:** There is already a database field, so it looks "close enough."
**How to avoid:** Define session metadata explicitly and make transcript storage depend on that session model rather than the other way around.
**Warning signs:** Plans only rename `conversationId` to `sessionId` without adding route metadata, reply context, or session lifecycle state.

### Pitfall 2: Keeping app chat history in one global localStorage key
**What goes wrong:** Multiple sessions are theoretically supported in services, but the visible app history still collapses into one transcript.
**Why it happens:** Teams delay the app wiring because they want to avoid Phase 4 UI work.
**How to avoid:** Add a minimal active-session hook and session-scoped history loading now, while deferring full session UX polish.
**Warning signs:** `useChatHistory.ts` still owns the primary conversation source with `neon-chat-history`.

### Pitfall 3: Building channel-specific routing rules too early
**What goes wrong:** Phase 2 starts encoding WhatsApp- or QQ-specific assumptions before the generic router and activation model exists.
**Why it happens:** Future channel work is mentally substituted for current routing work.
**How to avoid:** Define route kind, thread metadata, mention/activation inputs, and reply-context fields in a transport-neutral way first.
**Warning signs:** Plans talk about webhook payloads or provider auth instead of route keys and activation decisions.

### Pitfall 4: Forking transcript persistence from context persistence
**What goes wrong:** Checkpoints and compacted sessions keep one identifier, while main chat history and runtime sessions use another.
**Why it happens:** Existing context engineering code is treated as "separate."
**How to avoid:** Make canonical session id the shared join point for transcript rows, checkpoints, compacted sessions, and runtime session refs.
**Warning signs:** Plans touch `chat_messages` only, or `chat_checkpoints` only, without addressing both.

</common_pitfalls>

<open_questions>
## Open Questions

1. **How much in-app UI should Phase 2 expose?**
   - What we know: Phase 2 must prove isolated sessions and durable history.
   - What's unclear: whether this should include a visible session switcher or remain hook/service level.
   - Recommendation: keep the UI surface minimal and prove the behavior through app hooks plus regression tests, not a full parity interface.

2. **Should canonical session metadata live in a new table or in settings sidecars?**
   - What we know: transcript, checkpoint, and compacted-session data already live in SQLite.
   - What's unclear: whether session metadata should be a first-class table or derived from transcript rows.
   - Recommendation: use a first-class session table or equivalent repository-backed record; derived-only session identity will not age well once channel routes and activation policy arrive.

3. **How should old single-transcript chat history migrate?**
   - What we know: there is historic `conversation_id` storage and browser localStorage history.
   - What's unclear: whether Phase 2 should migrate legacy history automatically or tolerate a compatibility fallback.
   - Recommendation: planner should include a low-risk compatibility migration path that preserves existing app data but moves future writes onto the canonical session model.

</open_questions>

<sources>
## Sources

### Primary (HIGH confidence)
- `.planning/ROADMAP.md` — Phase 2 scope and success criteria
- `.planning/REQUIREMENTS.md` — `SESS-01` to `SESS-04`
- `.planning/phases/01-assistant-runtime-foundation/01-VERIFICATION.md` — verified Phase 1 substrate
- `.planning/research/openclaw-initial-analysis.md` — OpenClaw session/routing implications
- `.planning/research/SUMMARY.md` — recommended build order and shared session model
- `.planning/research/PHASE1-RUNTIME-RESEARCH.md` — prior session-service rationale

### Codebase anchors
- `src/services/assistant-runtime/types.ts`
- `src/app/hooks/useAIWorkflow.ts`
- `src/app/hooks/useChatHistory.ts`
- `src/services/storage/types.ts`
- `src/services/storage/electronStorage.ts`
- `src/services/storage/webStorage.ts`
- `electron/database/repositories/chatRepository.ts`
- `electron/database/repositories/contextRepository.ts`
- `electron/database/schema.sql`
- `electron/database/migrations.ts`
- `electron/ipc/dbHandlers.ts`
- `electron/ipc/contextHandlers.ts`
- `src/services/context/manager.ts`

</sources>

---

*Phase: 02-session-routing-and-persistence*
*Research captured: 2026-03-29*
