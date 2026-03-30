# Phase 4: In-App Assistant Parity - Research

**Researched:** 2026-03-30
**Domain:** In-app assistant parity, runtime inspection, workspace-faithful context assembly, and notebook workflow compatibility
**Confidence:** HIGH

<user_constraints>
## User Constraints

No phase-specific `04-CONTEXT.md` exists. The effective constraints come from `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `AGENTS.md`, and the completed Phase 2/3 artifacts.

### Locked Decisions
- Phase 4 must satisfy `APP-01`, `APP-02`, and `APP-03`.
- The in-app assistant must stay on the shared runtime delivered in Phases 1 through 3 instead of reintroducing UI-owned orchestration.
- Phase 4 must build on the canonical session model from Phase 2 and the runtime tool/media/delivery events from Phase 3.
- Users must be able to inspect session state, streaming state, and assembled assistant context from the in-app surface.
- Existing notebook editing, knowledge retrieval, voice input, memory injection, and other notebook-centric workflows must remain usable after parity work lands.
- Per `AGENTS.md`, TypeScript verification must use `bun`, Electron access stays behind `window.electronAPI`, and React work should preserve the established product language instead of introducing a parallel shell.

### Claude's Discretion
- Exact inspection-state model and module boundaries
- Exact split between runtime metadata contracts, hook state, and visible UI panels
- Exact session-switching UX inside the existing chat panel
- Exact regression-test split between hook, service, and component layers

### Deferred Ideas (OUT OF SCOPE)
- WhatsApp or QQ delivery surfaces
- Cross-surface safety restrictions and operator-only controls
- Full OpenClaw live-canvas parity
- Broad settings IA expansion beyond parity-critical wiring
- Channel-specific debug dashboards

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| APP-01 | The in-app AI experience uses the new assistant runtime instead of bypassing it with UI-specific logic. | Summary, Architecture Patterns 1/2/3, Common Pitfalls 1/2 |
| APP-02 | In-app conversations can inspect session state, streaming state, and assistant context in ways that remain compatible with channel sessions. | Summary, Architecture Patterns 1/4, Common Pitfalls 3/4 |
| APP-03 | Existing notebook and knowledge workflows remain usable after the runtime extraction. | Summary, Architecture Patterns 2/5, Common Pitfalls 2/5 |

</phase_requirements>

## Summary

Phase 4 is not about introducing the shared runtime into the app for the first time. That bridge already exists. `useAIWorkflow.ts` now creates `createAssistantRuntime(...)`, resolves canonical sessions, and consumes runtime `stream-delta`, `tool-status`, `media-status`, and `result` events. The remaining work is parity: making the app faithful to real notebook state, making runtime/session/context state inspectable in the UI, and proving that the notebook-first workflows still work once the assistant surface grows beyond a thin chat drawer.

The key codebase truth is that the current in-app bridge is functionally correct but still parity-incomplete:

1. `useAIWorkflow.ts` assembles a runtime request from placeholders rather than the real workspace. It currently uses `filesRef.current[0]?.id` as `activeFileId`, sends every file id as `selectedFileIds`, and attaches the entire notebook on every request. That is enough to prove the runtime seam, but not enough for trustworthy in-app context parity.
2. `useAssistantSessions.ts` already supports stable primary and secondary sessions, but `ChatPanel.tsx` and `ChatHeader.tsx` expose no session-switching or session inspection surface yet.
3. `AIState` only exposes `isThinking`, `error`, and `message`. That is far too narrow for APP-02, which explicitly requires session state, streaming state, and assembled assistant context inspection.
4. `ChatPanel.tsx` already has usable extension seams: a header, a side drawer feel, status-card rendering, memory management, and checkpoint UI. The right move is to add parity surfaces inside this shell, not replace it.
5. The app already has the data needed to improve context fidelity. `useAppWorkspaceState.ts` exposes `selectedText`, `getActivePaneContent()`, and active-pane information that Phase 4 can thread into the runtime request instead of relying on notebook-wide placeholders.

**Primary recommendation:** plan Phase 4 in four steps:

1. define inspectable runtime/session/context parity contracts
2. replace placeholder notebook context assembly with real workspace-aware request building
3. add session-switching and runtime inspection UI inside the existing chat panel
4. lock workflow compatibility with targeted in-app regression coverage

## Architecture Patterns

### Pattern 1: Separate Runtime Inspection State From `AIState`
**What:** Introduce a dedicated parity/inspection state model for session snapshots, lifecycle phase, stream progress, and assembled context summaries.
**When to use:** Any time the app needs to render runtime/session/context details beyond a generic thinking boolean.
**Why it fits here:** `AIState` is intentionally tiny and toast-like. Overloading it with parity metadata would mix transient UI notices with transport-neutral runtime state.

### Pattern 2: App Caller Supplies Real Workspace Facts
**What:** Thread actual active file, active pane, selected text, and selected file ids from app state into the runtime request.
**When to use:** Before invoking the shared runtime from the in-app surface.
**Why it fits here:** Phase 3 proved the runtime seam, but parity requires the notebook context to match what the user is actually looking at rather than a notebook-wide fallback snapshot.

### Pattern 3: Reuse Canonical Session Hooks, Do Not Rebuild Session State Locally
**What:** Drive create/switch/resume UI from `useAssistantSessions.ts` and session-scoped history from `useChatHistory.ts`.
**When to use:** For any in-app session picker or session status display.
**Why it fits here:** Phase 2 already solved session identity and persistence. Rebuilding local chat tabs inside `ChatPanel.tsx` would immediately drift from the canonical session model.

### Pattern 4: Inspector UI Should Render Read-Only Runtime Facts
**What:** Add an inspector or drawer that shows session metadata, lifecycle/streaming progress, and assembled context sections without becoming a second execution owner.
**When to use:** For APP-02 visibility requirements.
**Why it fits here:** The inspector should explain what the runtime is doing, not become the place where context is assembled or sessions are mutated.

### Pattern 5: Protect Notebook Workflows With Explicit Regression Slices
**What:** Add targeted tests for editing, memory injection, knowledge lookup, voice input submission, and session-scoped chat history around the parity changes.
**When to use:** Whenever Phase 4 modifies the app bridge or chat panel wiring.
**Why it fits here:** APP-03 is fundamentally a regression requirement. Without focused coverage, parity work can easily break notebook-specific flows while still leaving chat demos green.

### Anti-Patterns to Avoid
- **Inspection via console logs:** APP-02 requires user-visible inspection, not more debug output.
- **Reusing placeholder context assembly:** keeping `activeFileId = filesRef.current[0]?.id` will make the parity UI misleading.
- **Session UI outside canonical storage:** local-only session tabs would undermine Phase 2.
- **Inspector mutates runtime internals:** the parity UI should read runtime facts, not become a second orchestration path.
- **Notebook-wide attachments on every request:** attaching every note forever is a Phase 1 proof tactic, not a parity-grade behavior.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session switching | New local chat-tab state inside `ChatPanel.tsx` | `useAssistantSessions.ts` + `useChatHistory.ts` | The canonical session lifecycle and persistence already exist |
| Runtime observability | A second debug transport or ad-hoc event bus | Shared runtime metadata/events plus an app-facing inspection seam | Keeps APP-02 compatible with future channel callers |
| Workspace selection inference | Notebook-wide heuristics buried in the chat hook | `useAppWorkspaceState.ts`, active pane state, and editor selection refs | The app already knows the real active note and selected text |
| Tool/media status UI | A brand-new status surface separate from chat cards | Existing `ToolCallCard.tsx` / `StreamToolCard.tsx` plus a parity inspector | Preserves the established in-app visual language |

**Key insight:** most Phase 4 work is composition and observability, not invention. The codebase already contains the runtime seam, session lifecycle, and notebook workspace state needed to finish parity.

## Common Pitfalls

### Pitfall 1: Treating Phase 4 As "the runtime migration"
**What goes wrong:** Planning ignores that the hook already uses the runtime and spends effort re-proving Phase 3.
**Why it happens:** The roadmap wording can sound like the app is still fully UI-owned.
**How to avoid:** Build plans around parity gaps: inspectability, workspace fidelity, and workflow compatibility.
**Warning signs:** Plans only say "switch chat to runtime" without mentioning APP-02 or APP-03.

### Pitfall 2: Leaving Placeholder Workspace State in Place
**What goes wrong:** The inspector shows "context" but it is not actually tied to the user's active note or selection.
**Why it happens:** `useAIWorkflow.ts` already builds a valid runtime request and can appear "good enough."
**How to avoid:** Move active-file and selected-text sourcing onto real app state before shipping the parity UI.
**Warning signs:** `filesRef.current[0]` or "all file ids" remain in the final request path.

### Pitfall 3: Hiding Session State Behind the Storage Layer
**What goes wrong:** Sessions remain technically persisted, but users still cannot tell which session is active or why one conversation differs from another.
**Why it happens:** Phase 2 solved persistence, so planners can assume the job is finished.
**How to avoid:** Surface session id, title, route kind, and last-updated facts in the chat surface.
**Warning signs:** The only way to confirm the active session is reading the database or tests.

### Pitfall 4: Collapsing APP-02 Into Tool Cards Only
**What goes wrong:** Tool/media status is visible, but session lifecycle and assembled context remain invisible.
**Why it happens:** Phase 3 already added visible status cards, and they are tempting to reuse as the whole answer.
**How to avoid:** Add a separate read-only parity inspector for session/lifecycle/context while continuing to reuse status cards for tool/media/delivery.
**Warning signs:** Plans mention only `ToolCallCard.tsx` and never mention runtime context sections.

### Pitfall 5: Breaking Notebook Workflows While Improving Chat UX
**What goes wrong:** Session switching or inspector state regresses memory injection, voice input, compact-chat actions, or notebook editing flows.
**Why it happens:** The chat surface sits on top of multiple legacy notebook-first features that are easy to overlook.
**How to avoid:** Reserve a final parity-regression plan instead of treating tests as an afterthought.
**Warning signs:** No explicit plan files mention `useChatMemory.ts`, `useAppWorkspaceState.ts`, or workflow regression tests.

## Open Questions

1. **How much of the assembled context should be shown verbatim?**
   - What we know: APP-02 requires inspection of assembled assistant context.
   - What is unclear: whether the UI should show full section bodies or summaries with opt-in expansion.
   - Recommendation: show structured sections with concise previews and expandable details so parity does not overwhelm the chat surface.

2. **How far should notebook attachments be narrowed?**
   - What we know: attaching the whole notebook on every request is too blunt for parity.
   - What is unclear: whether Phase 4 should attach only active/selected notes or still allow notebook-wide context by policy.
   - Recommendation: make the default workspace-aware and explicit, with notebook-wide inclusion represented as a deliberate context section rather than a silent blanket attachment.

3. **Where should runtime inspection state live?**
   - What we know: `AIState` is too small, and `ChatMessage` should not become the parity state store.
   - What is unclear: whether inspection state belongs inside `useAIWorkflow.ts` or a separate hook.
   - Recommendation: keep request execution inside `useAIWorkflow.ts` but expose a dedicated app-facing inspection object or hook to avoid UI-state overload.

## Sources

### Primary (HIGH confidence)
- `.planning/ROADMAP.md` — Phase 4 goal and success criteria
- `.planning/REQUIREMENTS.md` — `APP-01`, `APP-02`, `APP-03`
- `.planning/phases/02-session-routing-and-persistence/02-04-PLAN.md` — canonical in-app session lifecycle scope
- `.planning/phases/03-tools-and-multimodal-delivery/03-RESEARCH.md` — Phase 3 assumptions and seams
- `.planning/phases/03-tools-and-multimodal-delivery/03-VERIFICATION.md` — confirmed runtime event and status behavior

### Codebase anchors
- `App.tsx`
- `src/app/hooks/useAIWorkflow.ts`
- `src/app/hooks/useAssistantSessions.ts`
- `src/app/hooks/useChatHistory.ts`
- `src/app/hooks/useAppWorkspaceState.ts`
- `components/ChatPanel.tsx`
- `components/ChatPanel/ChatHeader.tsx`
- `components/ChatPanel/MessageList.tsx`
- `components/ToolCallCard.tsx`
- `components/StreamToolCard.tsx`
- `src/services/assistant-runtime/createAssistantRuntime.ts`
- `src/services/assistant-runtime/types.ts`
- `src/services/assistant-runtime/contextAdapters.ts`
- `test/services/inAppAssistantRuntimeAdapter.test.ts`
- `test/services/inAppAssistantSessions.test.ts`
- `test/services/inAppSessionRuntimeBridge.test.ts`

---

*Phase: 04-in-app-assistant-parity*
*Research captured: 2026-03-30*
