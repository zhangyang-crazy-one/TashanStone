# Phase 1: Assistant Runtime Foundation - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 1 delivers the shared assistant runtime boundary for TashanStone so assistant execution stops living inside the current chat-panel hook path. The runtime must be notebook-native, provider-agnostic, and reusable by more than one caller. This phase also needs to align the runtime and configuration domain with the current Pencil settings wireframes so later UI work is backed by stable contracts instead of ad hoc state.

This phase does **not** deliver WhatsApp / QQ Channel adapters, full in-app parity, or the complete settings UI implementation. It lays the architecture and configuration substrate those later phases will use.

</domain>

<decisions>
## Implementation Decisions

### Runtime Boundary
- **D-01:** Phase 1 must extract a shared runtime entrypoint out of the current UI-owned AI workflow. The chat panel becomes a caller of the runtime rather than the owner of assistant orchestration.
- **D-02:** The runtime contract must stay transport-agnostic from day one so future in-app, command, WhatsApp, and QQ Channel callers can use the same request/event model without duplicating orchestration logic.
- **D-03:** Notebook context assembly is part of the runtime substrate in this phase. Notes, knowledge data, and workspace state must be injectable through adapters rather than by directly reading React component state.

### Design-Driven Scope
- **D-04:** Planning for Phase 1 must be driven by the current Pencil wireframes, not by runtime architecture alone. Any new runtime/config entities introduced here should map cleanly to the wireframed settings surfaces.
- **D-05:** The product-level settings information architecture is split into two surfaces and this split is locked for planning:
  1. AI / operator settings
  2. Notebook / app settings
- **D-06:** English and Chinese settings wireframes are both canonical inputs. Labels, shortcuts, and help text must be backed by translation keys or structured metadata, not hardcoded English strings.

### Settings and Configuration Model
- **D-07:** The AI / operator settings pages define the configuration areas that Phase 1 should model at the domain level: runtime, models, fallback, tools, plugins, skills, agents, scheduling, channels, media, safety, observability, UI, keyboard, and about.
- **D-08:** The notebook / app settings pages define the notebook-side capability areas that Phase 1 should account for in contracts and storage shape where they touch runtime context or future assistant behavior: workspace, editor, preview, links/tags, graph, search/index, study/SRS, appearance, shortcuts, voice/OCR, backup, and about.
- **D-09:** Phase 1 may implement only the minimal settings shell or persistence substrate needed to support the runtime extraction. It should not try to fully ship every designed settings page in this phase.

### Delivery Strategy
- **D-10:** Preserve existing notebook workflows during the extraction. The first consumer of the runtime can be an adapter around the current in-app assistant flow, but UI behavior must not remain the place where core runtime logic lives.
- **D-11:** Hardcoded operator-facing strings and shortcut definitions are not acceptable for new Phase 1 work. New settings/runtime metadata must be data-driven so the designed Chinese and English surfaces remain feasible.
- **D-12:** External channels, multimodal delivery completeness, graph/canvas parity, and advanced automation remain explicitly out of scope for Phase 1 even if their future settings pages are already designed.

### the agent's Discretion
- Exact module boundaries and filenames for the extracted runtime services
- Whether Phase 1 uses one or multiple adapters around existing chat entrypoints
- Whether settings persistence is introduced through existing repositories/services or a new thin configuration layer
- Exact task decomposition and wave ordering, as long as the locked decisions above are preserved

</decisions>

<specifics>
## Specific Ideas

- Current Pencil source of truth: `/home/zhangyangrui/pencil_designer/TUI_designer.pen`
- Confirmed AI / operator settings frames already exist in the `.pen` file.
- Confirmed the operator settings wireframe now includes separate `Plugins` and `Skills` frames in both English and Chinese, so later planning and functional design must not fold them back into `Tools` or `Agents`.
- Confirmed notebook / app settings frames already exist in the `.pen` file, including English and Chinese versions.
- Confirmed notebook settings frame set:
  - `Notebook Settings - Workspace`
  - `Notebook Settings - Editor`
  - `Notebook Settings - Preview`
  - `Notebook Settings - Links Tags`
  - `Notebook Settings - Graph`
  - `Notebook Settings - Search Index`
  - `Notebook Settings - Study SRS`
  - `Notebook Settings - Appearance`
  - `Notebook Settings - Shortcuts`
  - `Notebook Settings - Voice OCR`
  - `Notebook Settings - Backup`
  - `Notebook Settings - About`
- Confirmed Chinese notebook settings frame set:
  - `笔记设置 - 工作区（中文）`
  - `笔记设置 - 编辑器（中文）`
  - `笔记设置 - 预览（中文）`
  - `笔记设置 - 链接标签（中文）`
  - `笔记设置 - 图谱（中文）`
  - `笔记设置 - 搜索索引（中文）`
  - `笔记设置 - 学习 SRS（中文）`
  - `笔记设置 - 外观（中文）`
  - `笔记设置 - 快捷键（中文）`
  - `笔记设置 - 语音 OCR（中文）`
  - `笔记设置 - 备份（中文）`
  - `笔记设置 - 关于（中文）`
- Planning should therefore distinguish:
  - runtime/config contracts that must exist in Phase 1
  - designed surfaces that only need stubs or schema readiness in Phase 1

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap and requirements
- `.planning/ROADMAP.md` — Phase 1 goal, dependencies, success criteria, and roadmap ordering
- `.planning/REQUIREMENTS.md` — `CORE-01` through `CORE-04` and the later-phase boundaries that Phase 1 must not swallow
- `.planning/PROJECT.md` — project scope, OpenClaw parity direction, and channel constraints
- `.planning/STATE.md` — current project focus and pending todo context

### Phase 1 research
- `.planning/research/PHASE1-RUNTIME-RESEARCH.md` — implementation-focused runtime extraction analysis
- `.planning/research/SUMMARY.md` — synthesized OpenClaw research summary and recommended build order
- `.planning/research/openclaw-initial-analysis.md` — source-grounded parity framing and scope constraints

### Existing product design input
- `/home/zhangyangrui/pencil_designer/TUI_designer.pen` — current AI/operator settings and notebook/app settings wireframes in English and Chinese; use as the design contract input for Phase 1 planning

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `services/aiService.ts` — current provider-agnostic AI entrypoint that should sit under the extracted runtime rather than being called from UI hooks directly
- `services/ai/aiStreamingPipeline.ts` — streaming and tool-call loop substrate suitable for runtime execution
- `services/toolCallAdapters.ts` — existing provider tool-call normalization
- `services/ai/aiMemoryPipeline.ts` — closest existing session/context substrate
- `src/services/context/*` — context management, compaction, memory, and injection primitives
- `src/services/mcpService.ts` and Electron MCP handlers — reusable tool transport pieces, but not the runtime boundary itself
- `components/AISettingsModal/*` — current Electron settings surface and existing settings grouping patterns
- `utils/translations.ts` — existing translation layer that should back any new operator-facing metadata or labels

### Established Patterns
- Current assistant orchestration is heavily concentrated in `src/app/hooks/useAIWorkflow.ts`; this is the main extraction target
- Existing AI/chat behavior is UI-first and React-hook-driven; Phase 1 must invert that dependency
- The app already has shared repositories, storage, and service layers that should be preferred over introducing a second ad hoc state path

### Integration Points
- `src/app/hooks/useAIWorkflow.ts` — first caller that should be adapted to the new runtime
- `src/app/hooks/useChatHistory.ts` — likely needs replacement or insulation from runtime-owned session state
- `components/ChatPanel/*` — eventual in-app consumer surface for runtime events
- `electron/database/repositories/*` and `src/services/storage/*` — likely persistence and settings integration points

</code_context>

<deferred>
## Deferred Ideas

- WhatsApp channel adapter implementation
- QQ Channel adapter implementation
- Full in-app assistant parity migration
- Multimodal delivery parity beyond the minimum runtime contract
- OpenClaw-style canvas / graph / live workspace parity
- Full implementation of every designed settings page

</deferred>

---

*Phase: 01-assistant-runtime-foundation*
*Context gathered: 2026-03-28*
