# Requirements: TashanStone OpenClaw AI Parity

**Defined:** 2026-03-27
**Core Value:** TashanStone must provide an OpenClaw-class assistant core that feels native to the notebook product while remaining reusable across in-app and channel-based conversations.

## v1 Requirements

### Runtime Core

- [x] **CORE-01**: The system exposes a shared assistant runtime independent of the current UI chat panel.
- [x] **CORE-02**: The assistant runtime supports provider-agnostic model execution with streaming responses.
- [x] **CORE-03**: The assistant runtime supports notebook-context injection so notes, knowledge data, and workspace state can be assembled into assistant context.
- [x] **CORE-04**: The assistant runtime exposes a transport-agnostic interface that channel adapters can use without duplicating core logic.

### Sessions and Routing

- [ ] **SESS-01**: The system supports isolated assistant sessions rather than a single global in-app conversation state.
- [ ] **SESS-02**: Direct conversations can map to a primary session model while group/channel conversations remain isolated.
- [ ] **SESS-03**: The system supports activation and routing rules that determine when an inbound channel message should invoke the assistant.
- [ ] **SESS-04**: Session state, history, and reply context persist consistently across in-app and channel-backed conversations.

### Tools and Media

- [x] **TOOL-01**: The assistant runtime can invoke TashanStone tools and existing AI capabilities through a unified execution layer.
- [x] **TOOL-02**: The system supports multimodal inbound normalization for text, images, audio, and documents.
- [x] **TOOL-03**: The system supports outbound chunking and delivery policies that can be configured per channel.
- [ ] **TOOL-04**: Tool execution and media handling produce user-visible status and failure information instead of silent degradation.

### In-App Parity

- [x] **APP-01**: The in-app AI experience uses the new assistant runtime instead of bypassing it with UI-specific logic.
- [x] **APP-02**: In-app conversations can inspect session state, streaming state, and assistant context in ways that remain compatible with channel sessions.
- [ ] **APP-03**: Existing notebook and knowledge workflows remain usable after the runtime extraction.

### Channels

- [ ] **CHAN-01**: TashanStone supports WhatsApp as an external assistant channel on top of the shared runtime.
- [ ] **CHAN-02**: TashanStone supports QQ Channel as an external assistant channel on top of the shared runtime.
- [ ] **CHAN-03**: Channel adapters can enforce channel-specific auth, activation, chunking, and outbound formatting rules without forking the assistant core.
- [ ] **CHAN-04**: Channel messages can carry reply metadata and media placeholders into the shared assistant context model.

### Operations and Safety

- [ ] **SAFE-01**: The system defines clear boundaries between trusted local execution and channel-exposed execution paths.
- [ ] **SAFE-02**: The system can disable or restrict high-risk tool access for non-primary sessions.
- [ ] **SAFE-03**: The runtime surfaces configuration and status needed to debug channel connectivity and session routing failures.

## v2 Requirements

### Advanced Parity

- **ADV-01**: Recreate OpenClaw-style live canvas or agent-driven visual workspace behavior inside TashanStone.
- **ADV-02**: Add richer workflow skills and automation pipelines beyond the current tool set.
- **ADV-03**: Add more OpenClaw channel adapters beyond WhatsApp and QQ Channel if the shared runtime proves stable.
- **ADV-04**: Add node/device-style companion execution surfaces for mobile or desktop device-local actions.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Telegram, Discord, Slack, WeChat, and other OpenClaw channels | Deliberately constrained to WhatsApp and QQ Channel for this project |
| Full device-node parity across macOS/iOS/Android | Too large for initial assistant-core transplant |
| Standalone OpenClaw-style product shell replacing TashanStone UI | The notebook app remains the primary product surface |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CORE-01 | Phase 1 | Complete |
| CORE-02 | Phase 1 | Complete |
| CORE-03 | Phase 1 | Complete |
| CORE-04 | Phase 1 | Complete |
| SESS-01 | Phase 2 | Pending |
| SESS-02 | Phase 2 | Pending |
| SESS-03 | Phase 2 | Pending |
| SESS-04 | Phase 2 | Pending |
| TOOL-01 | Phase 3 | Complete |
| TOOL-02 | Phase 3 | Complete |
| TOOL-03 | Phase 3 | Complete |
| TOOL-04 | Phase 3 | Pending |
| APP-01 | Phase 4 | Complete |
| APP-02 | Phase 4 | Complete |
| APP-03 | Phase 4 | Pending |
| CHAN-01 | Phase 5 | Pending |
| CHAN-04 | Phase 5 | Pending |
| CHAN-02 | Phase 6 | Pending |
| CHAN-03 | Phase 6 | Pending |
| SAFE-01 | Phase 7 | Pending |
| SAFE-02 | Phase 7 | Pending |
| SAFE-03 | Phase 7 | Pending |

**Coverage:**
- v1 requirements: 22 total
- Mapped to phases: 22
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-27*
*Last updated: 2026-03-27 after roadmap creation*
