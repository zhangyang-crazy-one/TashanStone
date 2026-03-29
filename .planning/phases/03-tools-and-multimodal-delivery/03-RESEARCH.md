# Phase 3: Tools and Multimodal Delivery - Research

**Researched:** 2026-03-29
**Domain:** Unified tool execution, multimodal input normalization, outbound delivery policy, and visible runtime status
**Confidence:** MEDIUM

<user_constraints>
## User Constraints

No phase-specific `03-CONTEXT.md` exists yet. The effective constraints come from `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/PROJECT.md`, and the completed Phase 1/2 artifacts.

### Locked Decisions
- Phase 3 must satisfy `TOOL-01`, `TOOL-02`, `TOOL-03`, and `TOOL-04`.
- The implementation must extend the shared assistant runtime delivered in Phase 1 and the canonical session/routing model delivered in Phase 2.
- The runtime must invoke TashanStone capabilities and existing AI capabilities through one execution layer rather than UI-local logic.
- Multimodal handling in scope is inbound normalization for text, images, audio, and documents before runtime execution.
- Outbound chunking and delivery behavior must be transport-aware and configurable, but actual WhatsApp / QQ adapter delivery remains deferred to later phases.
- Tool execution and media handling must produce explicit user-visible status and failure signals instead of silent degradation.
- The project remains notebook-first and channel scope remains limited to WhatsApp and QQ Channel later; Phase 3 must not fork a separate bot runtime.
- Per `AGENTS.md`, use `bun` for TypeScript test/build operations and keep Electron access behind `window.electronAPI`.

### Claude's Discretion
- Exact tool executor shape and file/module decomposition
- Exact normalized multimodal payload schema
- Exact delivery-policy config format and chunking heuristics
- Whether MCP transport migration to the official SDK happens inside Phase 3 or is hidden behind a compatibility seam first
- Exact test split and wave ordering

### Deferred Ideas (OUT OF SCOPE)
- WhatsApp and QQ auth/webhook delivery implementations
- Full in-app assistant parity UI pass
- Non-primary session safety restrictions
- Broad plugin/skills productization
- Device-node or live-canvas parity

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TOOL-01 | The assistant runtime can invoke TashanStone tools and existing AI capabilities through a unified execution layer. | Standard stack, Architecture Patterns 1/2, Don't Hand-Roll, Code Examples |
| TOOL-02 | The system supports multimodal inbound normalization for text, images, audio, and documents. | Standard stack, Architecture Patterns 2/3, Common Pitfalls 2/3, Code Examples |
| TOOL-03 | The system supports outbound chunking and delivery policies that can be configured per channel. | Architecture Pattern 4, Common Pitfall 4, Environment Availability, Validation Architecture |
| TOOL-04 | Tool execution and media handling produce user-visible status and failure information instead of silent degradation. | Architecture Pattern 5, Common Pitfall 5, existing runtime event model, Validation Architecture |

</phase_requirements>

## Summary

Phase 3 is not a greenfield "add tools" phase. The codebase already has most of the raw ingredients: a transport-neutral runtime event envelope, provider-specific tool-call parsing, existing MCP connectivity, local OCR/audio services, PDF/DOCX extraction, and a UI that can already render tool status. What is missing is the shared runtime-owned seam that turns those scattered capabilities into one consistent execution and media pipeline.

The biggest planning risk is scope drift. Right now `useAIWorkflow.ts` still owns the real tool execution switchboard, the runtime request shape includes attachments but the provider layer still accepts only a `prompt: string`, and outbound delivery policy does not exist yet. If Phase 3 only adds more cases to `useAIWorkflow` or only extends prompt-building, it will fail the requirement intent even if a few new tool calls appear to work.

The correct Phase 3 move is to treat this as three connected refactors plus one policy layer:

1. move tool execution behind a runtime-owned executor interface
2. normalize inbound media into a typed content-part model before provider execution
3. translate those normalized parts into provider-specific request payloads
4. add a pure delivery-policy/chunking layer that later channel adapters can consume

Visible tool and media status should stay event-driven and transport-neutral, just like the session work in Phase 2.

**Primary recommendation:** plan Phase 3 as four steps: runtime tool executor, multimodal normalizer, provider input adaptation, then delivery/status policy with UI-visible media events.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@google/genai` | `1.47.0` | Gemini SDK for native multimodal inputs and function calling | Already used in repo; official JS SDK supports `parts`, Files API, PDF/audio/image input, and function calling |
| `@modelcontextprotocol/sdk` | `1.28.0` | Official MCP client/server protocol implementation | Standardizes MCP transport/protocol handling and avoids extending the current hand-rolled JSON-RPC client forever |
| `better-sqlite3` | `12.8.0` | Existing durable metadata persistence if delivery/status snapshots must be stored | Already used by Electron persistence layer; no second state store is needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `pdfjs-dist` | `5.5.207` | Parse PDFs and render pages for OCR fallback | Use for document normalization and page-level fallback extraction |
| `mammoth` | `1.12.0` | Extract DOCX text | Use for document normalization before runtime execution |
| `sherpa-onnx-node` | repo pinned `1.12.19` | Local file/audio transcription and preprocessing | Use for local audio normalization when Electron/native path is available |
| existing `ocrService` + `esearch-ocr`/ONNX stack | repo local | Local OCR for image/document fallback | Use for image/document extraction when native OCR is available |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@modelcontextprotocol/sdk` | Keep `electron/mcp/MCPClient.ts` as-is | Smaller immediate diff, but continues protocol drift and custom transport maintenance |
| Native multimodal provider payloads | Convert every image/audio/document to plain text before model call | Simpler executor, but loses provider-native vision/document understanding and hurts parity |
| Configurable delivery policy | Hard-coded `slice()` chunking in each future channel adapter | Faster short-term, but breaks Markdown/code fences and duplicates policy in every adapter |

**Installation:**
```bash
npm install @modelcontextprotocol/sdk zod
```

**Version verification:**
- `npm view @google/genai version` → `1.47.0` (published 2026-03-28)
- `npm view @modelcontextprotocol/sdk version` → `1.28.0` (published 2026-03-25)
- `npm view better-sqlite3 version` → `12.8.0` (published 2026-03-14)
- `npm view pdfjs-dist version` → `5.5.207` (published 2026-03-01)
- `npm view mammoth version` → `1.12.0` (published 2026-03-12)

## Architecture Patterns

### Recommended Project Structure
```text
src/services/assistant-runtime/
├── toolExecutor.ts           # Runtime-owned tool dispatch and status emission
├── toolRegistry.ts           # Built-in TashanStone tool definitions/handlers
├── mediaNormalizer.ts        # Text/image/audio/document → normalized input parts
├── providerInputAdapter.ts   # Normalized parts → provider-specific request payloads
├── deliveryPolicy.ts         # Channel-aware chunking and formatting rules
├── deliveryTypes.ts          # Delivery policy and chunk metadata contracts
└── types.ts                  # Extend runtime event/types with media + delivery status
```

### Pattern 1: Runtime-Owned Unified Tool Executor
**What:** Move all executable assistant capabilities behind one runtime service that can dispatch built-in notebook tools, knowledge search, MCP tools, OCR helpers, and transcription helpers.
**When to use:** Any time the runtime needs to invoke a capability on behalf of a caller.
**Example:**
```typescript
// Source: local pattern from src/app/hooks/useAIWorkflow.ts and src/services/assistant-runtime/createAssistantRuntime.ts
const result = await toolExecutor.execute({
  toolName,
  args,
  session: request.session,
  caller: request.caller,
});
```

**Prescriptive guidance:** `useAIWorkflow.ts` should stop owning the built-in tool switch statement. The hook should only bridge runtime events into UI state.

### Pattern 2: Normalize Inbound Media Into Typed Parts First
**What:** Introduce a content-part model such as `text`, `image`, `audio`, `document`, and `reference`, with extracted text and original metadata kept separately.
**When to use:** Before any provider execution, tool invocation, or delivery decision.
**Example:**
```typescript
type AssistantInputPart =
  | { kind: 'text'; text: string }
  | { kind: 'image'; mimeType: string; bytes?: string; extractedText?: string; uri?: string }
  | { kind: 'audio'; mimeType: string; uri?: string; transcript?: string }
  | { kind: 'document'; mimeType: string; uri?: string; extractedText?: string };
```

**Prescriptive guidance:** `AssistantRuntimeRequest.input` needs a typed parts field in addition to plain prompt text. The current `attachments` type is only metadata; it is not a normalization pipeline.

### Pattern 3: Provider Adapters Translate Normalized Parts, Not Raw UI State
**What:** Keep provider-specific request-shape translation in one adapter layer.
**When to use:** When building Gemini/OpenAI/Anthropic requests from the runtime.
**Example:**
```typescript
// Source: Google Gemini official docs
const response = await ai.models.generateContent({
  model: 'gemini-2.5-flash',
  contents: {
    parts: [
      { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
      { text: prompt },
    ],
  },
});
```

**Prescriptive guidance:** do not keep overloading `prompt` with OCR text, markdown placeholders, and tool instructions as the only provider boundary. Add a real provider input adapter.

### Pattern 4: Delivery Policy Must Be Pure, Configurable, and Transport-Agnostic
**What:** Create a pure chunking policy layer that receives final assistant output plus policy config and returns ordered outbound chunks.
**When to use:** Before any future channel adapter sends a reply, and optionally before in-app rendering when parity is useful.
**Example:**
```typescript
interface DeliveryPolicy {
  maxCharsPerChunk: number;
  splitPreference: Array<'paragraph' | 'sentence' | 'line' | 'hard-limit'>;
  preserveCodeFences: boolean;
  appendContinuationMarker: boolean;
}
```

**Prescriptive guidance:** build and test this as a standalone utility in Phase 3 even though WhatsApp/QQ sending is later. Channel phases should consume policy, not invent it.

### Pattern 5: Status Is an Event Stream, Not an Afterthought
**What:** Extend the runtime event envelope with media-normalization and delivery-status events alongside tool events.
**When to use:** Whenever OCR, transcription, file extraction, chunk emission, or tool execution starts, succeeds, skips, or fails.
**Example:**
```typescript
type AssistantRuntimeEvent =
  | ExistingRuntimeEvent
  | { type: 'media-status'; stage: 'ocr' | 'transcribe' | 'extract'; status: 'running' | 'success' | 'error'; detail?: string }
  | { type: 'delivery-status'; chunkIndex: number; totalChunks?: number; status: 'queued' | 'sent' | 'error' };
```

**Prescriptive guidance:** Phase 3 should not persist every telemetry event by default. It should emit them reliably and let callers decide what to render or store.

### Anti-Patterns to Avoid
- **UI-owned tool execution:** keeping the authoritative executor in `useAIWorkflow.ts` blocks channel reuse.
- **Prompt-only multimodal support:** flattening every attachment into text loses native image/document/audio capabilities.
- **Transport-specific chunking now:** building WhatsApp-specific chunk rules before a shared policy layer will be rework.
- **Silent fallback OCR/transcription:** media fallback without emitted status fails `TOOL-04`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| MCP protocol transport | More custom JSON-RPC framing and tool discovery logic | `@modelcontextprotocol/sdk` behind a local adapter | The official SDK already handles clients, transports, schema, and evolving protocol details |
| Document parsing | Custom PDF/DOCX parsers | Existing `pdfjs-dist`, `mammoth`, and OCR stack | Document extraction is already solved locally; Phase 3 should compose these, not replace them |
| Multimodal provider payloads | Ad-hoc prompt stuffing with base64 markers | Official provider content-part payloads | Native image/audio/document inputs preserve far more fidelity and reduce brittle prompt hacks |
| Output chunking | Naive string slicing | A delivery policy that respects paragraphs, code fences, and hard limits | Channel delivery will otherwise break Markdown and become adapter-specific tech debt |

**Key insight:** the repo already has good capability primitives; the missing piece is the runtime seam that composes them coherently.

## Common Pitfalls

### Pitfall 1: Leaving the Built-In Tool Switchboard in `useAIWorkflow.ts`
**What goes wrong:** The app works, but external callers still cannot invoke the same capabilities.
**Why it happens:** The hook already has working code for file and knowledge tools, so extending it feels cheaper.
**How to avoid:** Extract a runtime-owned executor and make the hook a caller adapter only.
**Warning signs:** New media or tool code is added only to `useAIWorkflow.ts`.

### Pitfall 2: Adding Attachment Metadata Without Adding Real Normalization
**What goes wrong:** `attachments` exist in the type system, but providers still only receive a giant text prompt.
**Why it happens:** The runtime request shape already mentions attachments, creating a false sense of support.
**How to avoid:** Add a proper normalization step with typed parts and provider adapters.
**Warning signs:** Provider signatures still accept only `prompt: string`.

### Pitfall 3: Treating OCR/Transcription as the Multimodal Strategy
**What goes wrong:** All image/audio/document understanding is reduced to local extraction even when providers can natively reason over the original media.
**Why it happens:** Local OCR/transcription already exists and feels sufficient.
**How to avoid:** Use local extraction as augmentation or fallback, not as the only representation.
**Warning signs:** Binary inputs are always converted to text before provider selection is even considered.

### Pitfall 4: Implementing Chunking With Hard Character Slices
**What goes wrong:** Replies break code fences, tables, and numbered steps, which will be painful once channel delivery arrives.
**Why it happens:** There is no channel adapter yet, so delivery policy looks speculative.
**How to avoid:** Build a pure chunker now and test it with Markdown-heavy outputs.
**Warning signs:** A function called `splitMessage(text, n)` appears with no syntax awareness.

### Pitfall 5: Surfacing Tool Events but Not Media Failures
**What goes wrong:** Tool execution looks observable, but OCR/transcription/document extraction failures still silently degrade the answer.
**Why it happens:** Current runtime events already include `tool-status`, so status work looks “mostly done.”
**How to avoid:** Extend the event model to cover media preprocessing and delivery outcomes too.
**Warning signs:** OCR/transcription errors only hit `console.error`.

## Code Examples

Verified patterns from official sources and local code:

### Runtime Event Bridge
```typescript
// Source: /home/zhangyangrui/my_programes/TashanStone/src/app/hooks/useAIWorkflow.ts
for await (const event of runtime.execute(runtimeRequest, { toolsCallback })) {
  if (event.type === 'stream-delta') {
    scheduleStreamingMessageUpdate(messageId, event.accumulatedText);
  } else if (event.type === 'tool-status') {
    updateAssistantToolCall(messageId, toUiToolCall(event.toolCallId, event.toolName, event.status));
  }
}
```

### Gemini Native Multimodal Input
```typescript
// Source: https://ai.google.dev/gemini-api/docs/vision
const response = await ai.models.generateContent({
  model: 'gemini-2.5-flash',
  contents: {
    parts: [
      { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
      { text: 'Describe the image and extract any visible text.' },
    ],
  },
});
```

### PDF Input Through File-Aware APIs
```typescript
// Source: https://platform.openai.com/docs/guides/pdf-files
const input = [
  {
    role: 'user',
    content: [
      { type: 'input_file', file_id: uploadedFileId },
      { type: 'input_text', text: 'Summarize this PDF and list action items.' },
    ],
  },
];
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Tool instructions embedded in prompt text | Native function/tool calling with structured schemas | Mature across provider SDK/docs by 2025-2026 | Phase 3 should keep prompt fallbacks secondary, not primary |
| Text-only prompt assembly for all attachments | Provider-native multimodal content parts plus local OCR/transcription fallback | Current Gemini/OpenAI/Anthropic docs all support multimodal input paths | The runtime contract should model media explicitly |
| Hand-rolled MCP client protocol logic | Official SDKs with standard transports and client helpers | MCP SDKs matured through 2025-2026 | Good candidate to hide or replace custom transport debt behind a stable adapter |

**Deprecated/outdated:**
- Treating `attachments` metadata as equivalent to multimodal support
- Continuing to centralize executable assistant capability logic in app hooks

## Open Questions

1. **Should Phase 3 migrate MCP transport to the official SDK immediately?**
   - What we know: the current custom MCP client works, but it is protocol debt.
   - What's unclear: whether that migration fits Phase 3 budget or should be hidden behind a compatibility adapter first.
   - Recommendation: define the runtime tool executor against a local `ToolProvider` interface now; migrate the MCP backend inside that seam if time allows.

2. **How much of the original media should be preserved after normalization?**
   - What we know: future channel delivery needs original references, while current provider calls may need extracted text or inline bytes.
   - What's unclear: whether Phase 3 should store binary payload references or only ephemeral normalized parts.
   - Recommendation: preserve metadata plus stable URI/file references; do not require long-term binary persistence yet.

3. **Does delivery policy need persistence in Phase 3?**
   - What we know: channel phases need configurable policy.
   - What's unclear: whether policy must already be operator-configurable in settings.
   - Recommendation: implement code-level defaults and typed config first; persist operator-facing settings in Phase 5/6 unless planning discovers a hard dependency sooner.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `bun` | Tests and TypeScript workflow per repo instructions | ✓ | `1.3.6` | None |
| `node` | Electron services, SDKs, MCP clients | ✓ | `v24.13.0` | None |
| `npm` / `npx` | Package install and MCP server launch patterns | ✓ | `11.6.2` | None |
| `ffmpeg` | Audio file normalization for Sherpa workflows | ✓ | `7.1.2` | Use already-transcribed text or skip local file audio features with visible status |
| `python3` | Some project-side support tooling only | ✓ | `3.11.10` | Not needed for main Phase 3 code path |

**Missing dependencies with no fallback:**
- None detected at shell level for the main Phase 3 implementation path.

**Missing dependencies with fallback:**
- Local OCR / local speech model assets were not verified from shell. Existing fallbacks already present in code are Gemini OCR for PDFs and explicit failure/status when native media tooling is unavailable.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `Vitest 4.0.16` in repo (`4.1.2` current upstream) |
| Config file | `vitest.config.ts` |
| Quick run command | `bun run vitest run test/services/assistantRuntime.execution.test.ts test/services/inAppAssistantRuntimeAdapter.test.ts test/services/streamingToolAdapter.test.ts test/services/aiService.toolEvents.test.ts` |
| Full suite command | `bun run bun:test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TOOL-01 | Runtime uses one executor surface for built-in tools, AI capabilities, and MCP-backed tools | unit | `bun run vitest run test/services/assistantToolExecutor.test.ts -x` | ❌ Wave 0 |
| TOOL-02 | Text/image/audio/document inputs normalize into one typed model with fallbacks | unit | `bun run vitest run test/services/assistantMediaNormalizer.test.ts -x` | ❌ Wave 0 |
| TOOL-03 | Delivery policy chunks rich output without breaking Markdown/code fences | unit | `bun run vitest run test/services/assistantDeliveryPolicy.test.ts -x` | ❌ Wave 0 |
| TOOL-04 | Runtime emits visible tool/media failure and status events that UI adapters can render | integration | `bun run vitest run test/services/inAppAssistantRuntimeAdapter.test.ts test/services/assistantRuntime.execution.test.ts -x` | ✅ extend existing |

### Sampling Rate
- **Per task commit:** `bun run vitest run test/services/assistantRuntime.execution.test.ts test/services/inAppAssistantRuntimeAdapter.test.ts`
- **Per wave merge:** `bun run vitest run test/services/assistantRuntime.execution.test.ts test/services/inAppAssistantRuntimeAdapter.test.ts test/services/streamingToolAdapter.test.ts test/services/aiService.toolEvents.test.ts`
- **Phase gate:** `bun run bun:test`

### Wave 0 Gaps
- [ ] `test/services/assistantToolExecutor.test.ts` — covers `TOOL-01`
- [ ] `test/services/assistantMediaNormalizer.test.ts` — covers `TOOL-02`
- [ ] `test/services/assistantDeliveryPolicy.test.ts` — covers `TOOL-03`
- [ ] Extend `test/services/inAppAssistantRuntimeAdapter.test.ts` for `media-status` and delivery-status rendering
- [ ] Extend `test/services/assistantRuntime.execution.test.ts` for media-status and unified executor failure propagation

## Sources

### Primary (HIGH confidence)
- Local planning artifacts:
  - `/home/zhangyangrui/my_programes/TashanStone/.planning/REQUIREMENTS.md`
  - `/home/zhangyangrui/my_programes/TashanStone/.planning/ROADMAP.md`
  - `/home/zhangyangrui/my_programes/TashanStone/.planning/PROJECT.md`
  - `/home/zhangyangrui/my_programes/TashanStone/.planning/phases/02-session-routing-and-persistence/02-03-SUMMARY.md`
  - `/home/zhangyangrui/my_programes/TashanStone/.planning/phases/02-session-routing-and-persistence/02-04-SUMMARY.md`
- Local code anchors:
  - `/home/zhangyangrui/my_programes/TashanStone/src/services/assistant-runtime/types.ts`
  - `/home/zhangyangrui/my_programes/TashanStone/src/services/assistant-runtime/createAssistantRuntime.ts`
  - `/home/zhangyangrui/my_programes/TashanStone/src/app/hooks/useAIWorkflow.ts`
  - `/home/zhangyangrui/my_programes/TashanStone/services/fileService.ts`
  - `/home/zhangyangrui/my_programes/TashanStone/services/aiService.ts`
  - `/home/zhangyangrui/my_programes/TashanStone/electron/mcp/index.ts`
- Official docs:
  - https://ai.google.dev/gemini-api/docs/function-calling
  - https://ai.google.dev/gemini-api/docs/vision
  - https://ai.google.dev/gemini-api/docs/audio
  - https://ai.google.dev/gemini-api/docs/document-processing
  - https://ai.google.dev/api/files
  - https://platform.openai.com/docs/guides/function-calling/how-do-i-ensure-the-model-calls-the-correct-function
  - https://platform.openai.com/docs/guides/pdf-files
  - https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/overview
  - https://docs.anthropic.com/en/docs/build-with-claude/vision
  - https://modelcontextprotocol.io/docs/sdk
  - https://github.com/modelcontextprotocol/typescript-sdk

### Secondary (MEDIUM confidence)
- `/home/zhangyangrui/my_programes/TashanStone/.planning/research/openclaw-initial-analysis.md`
- `https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/implement-tool-use`

### Tertiary (LOW confidence)
- None needed for the primary recommendations.

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM - provider/media libraries and MCP SDK are current and verified, but the exact Phase 3 migration scope for MCP is still a planning choice
- Architecture: HIGH - strongly grounded in existing repo seams and completed Phase 1/2 outputs
- Pitfalls: HIGH - directly supported by current code layout and requirement gaps

**Research date:** 2026-03-29
**Valid until:** 2026-04-05
