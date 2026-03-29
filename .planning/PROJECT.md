# TashanStone OpenClaw AI Parity

## What This Is

This project evolves TashanStone from a notebook-centric AI editor into a notebook-native assistant platform that recreates OpenClaw's core assistant behavior inside the existing product. The target is an assistant that can use notebook context, tools, sessions, and multimodal inputs while serving both the internal app experience and external channels, with channel scope intentionally limited to WhatsApp and QQ Channel.

## Core Value

TashanStone must provide an OpenClaw-class assistant core that feels native to the notebook product while remaining reusable across in-app and channel-based conversations.

## Requirements

### Validated

- Shared assistant runtime extracted from the UI-owned chat path and verified in **Phase 1: Assistant Runtime Foundation**.
- Provider-agnostic runtime execution, notebook-context injection, and caller-neutral runtime contracts verified in **Phase 1: Assistant Runtime Foundation**.
- Unified runtime-owned tool execution, multimodal normalization, configurable delivery policy, and visible tool/media status verified in **Phase 3: Tools and Multimodal Delivery**.
- In-app assistant parity for session visibility, workspace-faithful runtime context, and runtime inspection verified in **Phase 4: In-App Assistant Parity**.

### Active

- [ ] Add external channel support through WhatsApp and QQ Channel on top of the same assistant core.
- [ ] Preserve TashanStone's notebook-centric product strengths rather than bolting on a separate bot product.

### Out of Scope

- Full parity with all OpenClaw channels — this workstream only needs WhatsApp and QQ Channel to keep the integration surface manageable.
- Device-node parity across macOS, iOS, and Android — valuable later, but not required to recreate the core assistant behavior inside TashanStone first.
- Replacing the notebook app with a standalone bot control plane UI — the notebook product remains the primary home of the assistant.

## Context

- TashanStone already has an Electron + React notebook product with AI settings, chat, context, storage, and knowledge services.
- NotebookLM research was created in notebook `a51cc446-cfe3-4e6a-8d80-a80876af73ec` using OpenClaw repository and documentation sources.
- OpenClaw's documented center of gravity is a shared assistant core built from a gateway control plane, embedded agent runtime, isolated sessions, and channel adapters.
- The product translation challenge is not copying OpenClaw's shell; it is transplanting its assistant capabilities into TashanStone's notebook-native architecture.
- Phase 1 is complete as of 2026-03-28: the shared assistant runtime, production notebook/workspace/knowledge context adapters, and minimal operator/notebook settings schema are now in place.
- Phase 3 is complete as of 2026-03-29: the runtime now owns tool execution, multimodal preparation, channel-configurable delivery planning, and visible tool/media failure reporting in the in-app assistant.
- Phase 4 is complete as of 2026-03-30: the in-app assistant now exposes canonical session controls, workspace-faithful runtime requests, and a read-only runtime inspector without leaving the shared runtime path.

## Constraints

- **Platform**: TashanStone must stay notebook-first — the assistant architecture must strengthen the existing app instead of competing with it.
- **Channel Scope**: Only WhatsApp and QQ Channel are in scope — all other OpenClaw channels are explicitly deferred.
- **Architecture**: Channel behavior must be adapter-based — channel-specific logic cannot be tightly coupled to the existing UI chat panel.
- **Parity Strategy**: Recreate core assistant behavior first — peripheral OpenClaw surfaces such as broad device nodes and full remote ops are not phase-1 blockers.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Limit channel scope to WhatsApp and QQ Channel | Reduces integration sprawl while preserving the main cross-channel requirement | — Pending |
| Rebuild around a shared assistant runtime rather than UI-bound chat logic | OpenClaw parity depends on reusable routing, sessions, tools, and media handling | Phase 1 complete |
| Extend the shared runtime before expanding UI parity | Tool execution, multimodal input, and delivery policy needed to be runtime-owned before broader in-app parity work | Phase 3 complete |
| Expose parity UI inside the existing chat drawer | Session visibility and runtime inspection needed to feel notebook-native without spawning a second assistant shell | Phase 4 complete |
| Treat TashanStone as the primary assistant home | The notebook product is the core differentiator and context source | — Pending |
| Use NotebookLM as a dedicated research workspace for OpenClaw analysis | Keeps source-grounded product and architecture findings available for later phases | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `$gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `$gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-30 after Phase 4 completion*
