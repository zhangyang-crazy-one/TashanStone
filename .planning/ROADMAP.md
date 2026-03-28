# Roadmap: TashanStone OpenClaw AI Parity

## Overview

This roadmap turns TashanStone into a notebook-native assistant platform by first extracting a shared assistant runtime, then layering isolated sessions, tools and multimodal handling, in-app parity, external channel delivery for WhatsApp and QQ Channel, and the safety and operational controls needed to run the whole system reliably.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 1: Assistant Runtime Foundation** - Establish the shared notebook-native runtime that all assistant surfaces will use.
- [ ] **Phase 2: Session Routing and Persistence** - Introduce isolated sessions, routing rules, and durable conversation state.
- [ ] **Phase 3: Tools and Multimodal Delivery** - Unify tool execution, media normalization, and outbound delivery behavior.
- [ ] **Phase 4: In-App Assistant Parity** - Move the desktop assistant experience onto the shared runtime without regressing notebook workflows.
- [ ] **Phase 5: WhatsApp Channel Launch** - Deliver the first external channel on top of the shared runtime with reply metadata support.
- [ ] **Phase 6: QQ Channel and Adapter Generalization** - Add QQ Channel and prove adapter-specific policies without forking core logic.
- [ ] **Phase 7: Safety and Operations Controls** - Add runtime guardrails and debugging visibility for cross-surface operation.

## Phase Details

### Phase 1: Assistant Runtime Foundation
**Goal**: TashanStone exposes a shared assistant runtime that is notebook-native, provider-agnostic, and reusable outside the current chat panel.
**Depends on**: Nothing (first phase)
**Requirements**: CORE-01, CORE-02, CORE-03, CORE-04
**Success Criteria** (what must be TRUE):
  1. A maintainer can invoke assistant execution through a shared runtime entrypoint without depending on the existing chat-panel code path.
  2. A runtime caller can switch supported model providers and still receive streamed assistant output through the same interface.
  3. A notebook-backed request can include notes, knowledge data, and workspace state in the assembled assistant context before model execution.
  4. More than one caller type can use the same runtime contract without copying orchestration logic.
**Plans**: 3 plans
Plans:
- [x] 01-01-PLAN.md — Define the shared runtime contracts and the wireframe-aligned settings descriptor catalog.
- [ ] 01-02-PLAN.md — Implement the runtime execution core and notebook-context assembly on top of existing AI/context services.
- [ ] 01-03-PLAN.md — Migrate one real in-app caller and wire minimal config persistence/shell support for the new schema.

### Phase 2: Session Routing and Persistence
**Goal**: Conversations run as isolated assistant sessions with consistent routing, activation, and persistence rules across surfaces.
**Depends on**: Phase 1
**Requirements**: SESS-01, SESS-02, SESS-03, SESS-04
**Success Criteria** (what must be TRUE):
  1. A user can hold separate assistant conversations without state leaking between sessions.
  2. Direct conversations and group or channel conversations stay isolated while mapping to the correct session model.
  3. Inbound messages only trigger the assistant when configured activation and routing rules are met.
  4. Session history, reply context, and state remain available when the same conversation continues across in-app and channel-backed surfaces.
**Plans**: TBD

### Phase 3: Tools and Multimodal Delivery
**Goal**: The shared runtime can call TashanStone capabilities, understand multimodal inputs, and deliver responses with visible execution status.
**Depends on**: Phase 2
**Requirements**: TOOL-01, TOOL-02, TOOL-03, TOOL-04
**Success Criteria** (what must be TRUE):
  1. The assistant can invoke TashanStone tools and existing AI capabilities through one execution layer.
  2. Text, images, audio, and documents are normalized into a consistent assistant input model before runtime execution.
  3. Outbound assistant responses can be chunked and delivered according to configurable delivery policy.
  4. Users and operators can see tool progress, media handling status, and failures instead of silent degradation.
**Plans**: TBD

### Phase 4: In-App Assistant Parity
**Goal**: The in-app assistant interface runs on the shared runtime and remains compatible with notebook-centric workflows.
**Depends on**: Phase 3
**Requirements**: APP-01, APP-02, APP-03
**Success Criteria** (what must be TRUE):
  1. A user can chat in the in-app assistant interface through the shared runtime and receive streamed responses.
  2. A user can inspect session state, streaming state, and assembled assistant context from the in-app view.
  3. A user can keep using notebook editing, knowledge retrieval, and existing in-app workflows after the runtime extraction.
**Plans**: TBD
**UI hint**: yes

### Phase 5: WhatsApp Channel Launch
**Goal**: WhatsApp conversations can use the shared assistant runtime with isolated sessions and channel-aware reply context.
**Depends on**: Phase 4
**Requirements**: CHAN-01, CHAN-04
**Success Criteria** (what must be TRUE):
  1. A WhatsApp conversation can invoke the shared runtime and receive assistant replies without going through the desktop UI.
  2. Inbound WhatsApp replies and media references are preserved as reply metadata and placeholders inside the shared assistant context.
  3. WhatsApp conversations remain isolated from in-app and other channel sessions.
**Plans**: TBD

### Phase 6: QQ Channel and Adapter Generalization
**Goal**: QQ Channel is delivered on the same runtime while channel adapters prove they can enforce channel-specific rules without forking the core.
**Depends on**: Phase 5
**Requirements**: CHAN-02, CHAN-03
**Success Criteria** (what must be TRUE):
  1. A QQ Channel conversation can invoke the shared runtime and receive assistant replies through the same session model used elsewhere.
  2. WhatsApp and QQ Channel can apply different auth, activation, chunking, and outbound formatting rules without duplicating assistant core logic.
  3. Adding the second channel does not break session isolation or regress in-app assistant behavior.
**Plans**: TBD

### Phase 7: Safety and Operations Controls
**Goal**: Operators can safely expose the assistant across notebook-local and channel-based surfaces with clear runtime visibility.
**Depends on**: Phase 6
**Requirements**: SAFE-01, SAFE-02, SAFE-03
**Success Criteria** (what must be TRUE):
  1. An operator can distinguish trusted local execution paths from channel-exposed execution paths when configuring the assistant.
  2. High-risk tools can be disabled or restricted for non-primary sessions while approved notebook-local use continues to work.
  3. An operator can inspect the configuration and status needed to diagnose channel connectivity and session-routing failures.
**Plans**: TBD

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Assistant Runtime Foundation | 1/3 | In Progress | 2026-03-28 |
| 2. Session Routing and Persistence | 0/TBD | Not started | - |
| 3. Tools and Multimodal Delivery | 0/TBD | Not started | - |
| 4. In-App Assistant Parity | 0/TBD | Not started | - |
| 5. WhatsApp Channel Launch | 0/TBD | Not started | - |
| 6. QQ Channel and Adapter Generalization | 0/TBD | Not started | - |
| 7. Safety and Operations Controls | 0/TBD | Not started | - |
