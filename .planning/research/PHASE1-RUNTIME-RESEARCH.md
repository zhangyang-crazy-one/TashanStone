# Phase 1 Runtime Research

## Scope

This document converts the current OpenClaw parity research into an implementation-focused Phase 1 plan for TashanStone.

Phase 1 target from the roadmap:

- Build a shared assistant runtime that is notebook-native, provider-agnostic, and reusable outside the current chat panel.

Phase 1 requirements:

- `CORE-01`: shared assistant runtime independent of the current UI chat panel.
- `CORE-02`: provider-agnostic model execution with streaming responses.
- `CORE-03`: notebook-context injection for notes, knowledge data, and workspace state.
- `CORE-04`: transport-agnostic runtime interface for future channel adapters.

Research inputs used here:

- `.planning/research/openclaw-initial-analysis.md`
- `.planning/research/SUMMARY.md`
- NotebookLM notebook `OpenClaw AI Feature Parity Research for TashanStone` (`a51cc446-cfe3-4e6a-8d80-a80876af73ec`)
- Local codebase scan of current AI, context, chat, and app orchestration modules

## Executive Conclusion

TashanStone already has most of the low-level primitives required for a shared assistant runtime:

- provider abstraction
- streaming generation
- tool-call adapters
- context budgeting and compaction
- persistent memory and knowledge retrieval

The missing architecture is not model capability. The missing architecture is a runtime boundary.

Today, runtime orchestration is still embedded in `src/app/hooks/useAIWorkflow.ts`, where UI chat state, notebook file mutations, tool execution, streaming updates, and assistant calls are mixed together. As long as that remains true, TashanStone cannot satisfy `CORE-01` or `CORE-04`, and any future WhatsApp / QQ Channel adapter would have to duplicate or tunnel through UI-specific code.

Phase 1 should therefore extract a dedicated assistant runtime service layer before adding any external channel implementation.

## OpenClaw Translation

The prior OpenClaw research is consistent on one point: channels are adapters around a shared assistant core, not separate assistant implementations.

Minimum boundary to transplant into TashanStone:

- shared session and routing policy
- shared provider-agnostic execution pipeline
- shared tool execution pipeline
- shared notebook context assembly
- shared memory and streaming policy
- future channel adapters for WhatsApp and QQ Channel

Responsibilities that must remain outside the runtime:

- React component state and rendering
- local overlay visibility and modal control
- platform-specific channel ingress/auth/mention gating/outbound formatting
- view-only chat list virtualization and input widgets

## Current Module Map

### Reusable Core Building Blocks Already Present

`services/aiService.ts`

- Main provider-agnostic entrypoint for non-streaming and streaming generation.
- Already abstracts Gemini, Ollama, OpenAI-compatible, and Anthropic-compatible providers.
- Already exports context and memory helpers from `aiMemoryPipeline`.
- Good candidate to sit under a future runtime execution service instead of being called directly by UI hooks.

`services/ai/aiStreamingPipeline.ts`

- Already encapsulates provider-specific streaming and native tool-call loops.
- Already supports tool event callbacks and provider-specific tool result formatting.
- Strong candidate for the runtime execution engine used by all callers.

`services/toolCallAdapters.ts`

- Already normalizes provider tool-call parsing and formatting.
- Useful as part of the runtime execution layer, not as a UI concern.

`src/services/context/*`

- `manager.ts`, `token-budget.ts`, `compaction.ts`, `checkpoint.ts`, `injector.ts`, `memory*`
- This is the strongest reusable substrate for runtime session state, context budgeting, compaction, and memory injection.
- Phase 1 should build on this, not replace it.

`services/ai/aiMemoryPipeline.ts`

- Already provides session-oriented context manager accessors and persistence hooks.
- Has an LRU cache for session context managers.
- This is the closest thing the app already has to a runtime session substrate.

`src/services/mcpService.ts`

- Renderer-side IPC wrapper for MCP tools.
- Useful as one tool transport inside the runtime, but not itself the runtime boundary.

### UI-Coupled Orchestration That Must Move

`src/app/hooks/useAIWorkflow.ts`

- Creates user and assistant UI messages directly.
- Owns `executeToolUnified` inline.
- Mixes notebook file CRUD, RAG search, MCP fallback, streaming control, and chat list mutation.
- This is the current architectural bottleneck.

`src/app/hooks/useChatHistory.ts`

- Stores chat history directly in localStorage under a UI-specific key.
- Not a reusable session model.
- Future runtime callers cannot depend on React-local state + browser storage.

`App.tsx`

- Composes the whole application and wires `useAIWorkflow` straight into the chat panel.
- Correct place for UI composition, wrong place for assistant runtime semantics.

`components/ChatPanel.tsx`

- Mostly presentational, but its contract is still shaped around UI-owned messages rather than runtime-owned sessions/events.

## Gap Analysis Versus Phase 1 Goal

### What Already Exists

- Provider abstraction
- Streaming output
- Tool-call normalization
- RAG / notebook knowledge search
- Context management and compaction
- Memory persistence primitives

### What Is Missing

- Shared runtime entrypoint independent from React hooks
- Stable assistant session abstraction
- Caller abstraction for multiple surfaces
- Transport-agnostic request/response contract
- Separation of tool execution from UI message mutation
- Separation of notebook context assembly from chat-panel prompt assembly
- Runtime event stream that is not tied to `setChatMessages`

### Main Failure Mode Today

The current architecture assumes the assistant is a feature of the chat panel.

Phase 1 requires the opposite:

The chat panel must become only one caller of the assistant runtime.

## Minimum Viable Runtime Boundary

The first extraction should be a shared runtime boundary with four internal services.

### 1. Session Service

Responsibilities:

- create or resume assistant sessions
- map caller identity to session identity
- keep session metadata separate from UI message arrays
- support direct-chat session now and external channel session later

Minimum types:

```ts
type AssistantCallerKind = 'chat_panel' | 'command' | 'whatsapp' | 'qq_channel';

interface AssistantSessionRef {
  sessionId: string;
  caller: AssistantCallerKind;
  workspaceId?: string;
  notebookId?: string;
  channelThreadId?: string;
}
```

### 2. Context Assembly Service

Responsibilities:

- collect notebook files / active note / selected text / workspace state
- inject RAG context when requested
- merge memory layers and runtime context policy
- return a runtime-ready execution context

This should consume current notebook data through an adapter passed in by the caller, not import React state directly.

### 3. Execution Service

Responsibilities:

- call `generateAIResponse` / `generateAIResponseStream`
- stay provider-agnostic
- emit streaming text/tool/status events
- manage model/tool lifecycle without mutating UI state

This layer should wrap:

- `services/aiService.ts`
- `services/ai/aiStreamingPipeline.ts`
- `services/toolCallAdapters.ts`

### 4. Tool Runtime Service

Responsibilities:

- dispatch built-in notebook tools
- dispatch MCP tools
- normalize results and failures
- expose tool events to all callers

This is where the current inline `executeToolUnified` logic should move.

## What Must Stay Outside

These concerns should not enter the extracted runtime:

- React component state
- `setChatMessages`
- modal / overlay toggles
- local scroll behavior
- chat list virtualization
- microphone button states
- future WhatsApp / QQ auth and webhook transport details
- future QQ Channel formatting / mention gating rules

## Recommended Runtime Contract

Phase 1 does not need the full OpenClaw gateway surface. It needs a small stable contract.

```ts
interface AssistantRuntimeRequest {
  session: AssistantSessionRef;
  input: {
    role: 'user';
    content: string;
  };
  context: {
    includeNotebookState: boolean;
    includeKnowledgeSearch: boolean;
    activeFileId?: string;
    selectedFileIds?: string[];
  };
  execution: {
    providerConfig: AIConfig;
    stream: boolean;
  };
}

type AssistantRuntimeEvent =
  | { type: 'message_started'; sessionId: string; messageId: string }
  | { type: 'message_delta'; sessionId: string; messageId: string; text: string }
  | { type: 'tool_started'; sessionId: string; toolCall: ToolCall }
  | { type: 'tool_updated'; sessionId: string; toolCall: ToolCall }
  | { type: 'tool_finished'; sessionId: string; toolCall: ToolCall }
  | { type: 'message_completed'; sessionId: string; messageId: string; content: string }
  | { type: 'message_failed'; sessionId: string; error: string };

interface AssistantRuntime {
  run(
    request: AssistantRuntimeRequest,
    onEvent: (event: AssistantRuntimeEvent) => void
  ): Promise<void>;
}
```

This contract is sufficient for:

- current React chat panel
- future slash-command caller
- future background automation caller
- future WhatsApp / QQ Channel adapters

## Recommended Extraction Order

### Step 1. Extract Tool Execution

Move `executeToolUnified` out of `useAIWorkflow.ts` into a runtime service, for example:

- `src/services/assistant-runtime/toolRuntime.ts`

Why first:

- it is currently the hardest coupling point
- it mixes notebook CRUD, KB search, and MCP fallback
- channel adapters cannot reuse the runtime until tools stop depending on React hook closures

### Step 2. Extract Runtime Execution Wrapper

Create a dedicated runtime facade, for example:

- `src/services/assistant-runtime/runtime.ts`

This layer should:

- accept a session ref
- assemble context through injected adapters
- call streaming/non-streaming execution
- emit runtime events

### Step 3. Introduce Session and Caller Types

Add explicit runtime types, for example:

- `src/services/assistant-runtime/types.ts`

This should define:

- caller kinds
- session refs
- runtime requests
- runtime events
- context-provider interface

### Step 4. Adapt the React Chat Panel to Become a Caller

Refactor `useAIWorkflow.ts` into a thin UI adapter:

- create runtime request from current UI state
- subscribe to runtime events
- translate runtime events into `ChatMessage[]` UI updates

After this step, the chat panel becomes one client of the runtime instead of the runtime itself.

### Step 5. Move Chat Persistence Toward Session Persistence

Replace or wrap `useChatHistory.ts` so persisted data is keyed by runtime session identity, not just one browser-local chat history bucket.

This is not full channel persistence yet, but it prevents Phase 1 from hard-coding a single chat stream.

## Candidate Folder Structure

```text
src/services/assistant-runtime/
  types.ts
  runtime.ts
  sessionService.ts
  contextAssembly.ts
  toolRuntime.ts
  eventAdapters.ts
```

Suggested ownership:

- runtime core lives under `src/services`
- React hooks become adapters in `src/app/hooks`
- UI rendering stays in `components`

## Common Pitfalls

### Pitfall 1. Rebuilding Context Logic Outside Existing Context Services

Do not hand-roll a second context stack.

Reuse:

- `src/services/context/*`
- `services/ai/aiMemoryPipeline.ts`

### Pitfall 2. Keeping Tool Dispatch in React Hooks

If tool execution stays inside `useAIWorkflow.ts`, Phase 1 will fail even if a runtime facade exists on paper.

Reason:

- external callers will still depend on hook state and UI mutation paths

### Pitfall 3. Treating Chat Messages as the Source of Truth

`ChatMessage[]` is a rendering model, not a runtime state model.

The runtime should own session execution and event emission. The UI should derive display state from runtime events.

### Pitfall 4. Letting Provider Config Bleed into UI-Only Paths

OpenClaw-style parity needs runtime orchestration settings, not only a settings modal.

The runtime should accept provider config as execution input, but its public API should not depend on React settings components.

### Pitfall 5. Coupling Channel Identity to Notebook Identity Too Early

For future WhatsApp / QQ support, session identity must support:

- notebook-native direct conversations
- external-thread-backed conversations
- isolated sessions per channel thread or sender

Do not model session identity as only `activeFileId` or only a browser chat id.

## Don’t Hand-Roll

Reuse existing project primitives instead of rebuilding them:

- provider execution: `services/aiService.ts`
- streaming tool-call loops: `services/ai/aiStreamingPipeline.ts`
- tool-call parsing/formatting: `services/toolCallAdapters.ts`
- context budgeting and compaction: `src/services/context/*`
- session cache and context manager lookup: `services/ai/aiMemoryPipeline.ts`

Also avoid building a full OpenClaw-like gateway in Phase 1.

Phase 1 only needs a stable runtime seam that future channels can call.

## Migration Sequence

1. Create `assistant-runtime/types.ts` with caller/session/request/event contracts.
2. Create `toolRuntime.ts` and move built-in + MCP tool dispatch there.
3. Create `contextAssembly.ts` and define notebook-context adapter inputs.
4. Create `runtime.ts` that wraps `generateAIResponse` and `generateAIResponseStream`.
5. Refactor `useAIWorkflow.ts` to call the runtime and translate runtime events into UI messages.
6. Refactor chat persistence to store per-session state rather than one global chat history.
7. Only after these steps begin Phase 2 channel adapter work.

## Code Examples

### UI Adapter Shape

```ts
const runtime = createAssistantRuntime({
  toolRuntime,
  contextAssembler,
});

await runtime.run(request, event => {
  switch (event.type) {
    case 'message_delta':
      updateAssistantMessage(event.messageId, event.text);
      break;
    case 'tool_updated':
      updateToolCall(event.toolCall);
      break;
    case 'message_failed':
      showError(event.error);
      break;
  }
});
```

### Context Provider Shape

```ts
interface NotebookContextProvider {
  getActiveFile(): MarkdownFile | null;
  getAllFiles(): MarkdownFile[];
  searchKnowledge(query: string, maxResults: number): Promise<string>;
  getWorkspaceState(): Promise<Record<string, unknown>>;
}
```

### Tool Runtime Shape

```ts
interface ToolRuntime {
  execute(
    session: AssistantSessionRef,
    toolName: string,
    args: Record<string, JsonValue>,
    onEvent?: (toolCall: ToolCall) => void
  ): Promise<JsonValue>;
}
```

## Implementation Recommendation

The first implementation target should not be WhatsApp or QQ Channel.

The first implementation target should be:

- make the existing chat panel use a real shared assistant runtime

If that works cleanly, the same contract can then be reused by:

- a command palette caller
- background automation
- WhatsApp adapter
- QQ Channel adapter

That is the smallest Phase 1 slice that proves all four roadmap success criteria.

## Exit Criteria For Phase 1 Research

The research is sufficient to move into planning and implementation if the next plan commits to these deliverables:

- a new assistant-runtime module boundary
- tool execution extracted out of `useAIWorkflow.ts`
- notebook context assembly extracted out of UI hooks
- runtime event contract independent from React state setters
- chat panel refactored into a runtime caller rather than runtime owner
