---
status: diagnosed
phase: 04-in-app-assistant-parity
source:
  - 04-01-SUMMARY.md
  - 04-02-SUMMARY.md
  - 04-03-SUMMARY.md
  - 04-04-SUMMARY.md
started: 2026-03-30T08:13:09+08:00
updated: 2026-03-30T09:10:53+08:00
---

## Current Test

[testing complete]

## Tests

### 1. Send a Message Through the Shared Runtime
expected: Opening the in-app assistant and sending a prompt returns an assistant response through the parity-enhanced chat drawer without obvious runtime or UI breakage.
result: issue
reported: "AI对话正常[Image #1]，设置显示规划中？真实实现了吗？"
severity: major

### 2. Focused Workspace Context Is Used
expected: When a specific note or workspace selection is active, the assistant behaves as if it is grounded in that focused workspace context rather than the entire notebook by default.
result: issue
reported: "[Image #1]，工作区的内容访问不了，还有一个前端问题，AI对话输入框，当我打的文字多了他并不会自动下一行，而是被截断"
severity: major

### 3. Switch Between Sessions
expected: The chat drawer shows the active session clearly, lets you switch sessions or create a new one, and preserves separate conversation state per session.
result: issue
reported: "隔离分支在AI对话的哪里设置？我只看到了对话分支隔离前端没有使用的指示[Image #1]"
severity: major

### 4. Inspect Runtime State
expected: Opening the runtime inspector during or after a response shows readable session, lifecycle, stream, and context details without requiring console inspection.
result: issue
reported: "设置中存在，但是流式没有输出没有效果"
severity: major

### 5. Existing Chat Controls Still Work
expected: Clear chat, compact mode, stop streaming, and injected-message submission remain available in the parity-enhanced chat surface and behave normally.
result: issue
reported: "[Image #1]，UI中并没有任何地方可以控制上下文"
severity: major

### 6. Notebook Workflows Still Work With Chat Open
expected: While the parity chat is open, you can still edit notes and use notebook-centric workflows such as knowledge retrieval or related assistant actions without obvious blockage or stale behavior.
result: pass

## Summary

total: 6
passed: 1
issues: 5
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "Opening the in-app assistant and sending a prompt returns an assistant response through the parity-enhanced chat drawer without obvious runtime or UI breakage."
  status: failed
  reason: "User reported: AI对话正常[Image #1]，设置显示规划中？真实实现了吗？"
  severity: major
  test: 1
  root_cause: "The AI settings modal still ships a descriptor-backed shell and phase labels instead of fully wired operator/notebook controls, so implemented and deferred surfaces are presented together as if they were real settings."
  artifacts:
    - path: "components/AISettingsModal.tsx"
      issue: "Renders descriptor shell UI and explicitly states Phase 1 only wires shell and persistence."
    - path: "src/services/assistant-runtime/settingsCatalog.ts"
      issue: "Marks many settings surfaces as deferred while still exposing them in the modal catalog."
    - path: "utils/translations.ts"
      issue: "Phase readiness labels are shown to users rather than hidden behind internal planning state."
  missing:
    - "Hide or clearly separate deferred settings sections from implemented controls in the user-facing modal."
    - "Replace planning-state badges with truthful implementation-status messaging tied to real settings availability."
    - "Add regression coverage for implemented vs deferred assistant settings presentation."

- truth: "When a specific note or workspace selection is active, the assistant behaves as if it is grounded in that focused workspace context rather than the entire notebook by default."
  status: failed
  reason: "User reported: [Image #1]，工作区的内容访问不了，还有一个前端问题，AI对话输入框，当我打的文字多了他并不会自动下一行，而是被截断"
  severity: major
  test: 2
  root_cause: "Focused workspace context is assembled behind the runtime seam but the chat surface does not show or let the user control what note/selection was attached, and the composer is still a single-line text input that truncates long prompts."
  artifacts:
    - path: "components/ChatPanel/ChatInput.tsx"
      issue: "Uses a single-line input element instead of a multiline auto-growing composer."
    - path: "src/app/hooks/useAIWorkflow.ts"
      issue: "Sends focused workspace IDs and attachments into the runtime without any visible confirmation in the chat UI."
    - path: "src/services/assistant-runtime/contextAdapters.ts"
      issue: "Builds notebook/workspace context for the model, but the resulting context remains invisible to the user."
  missing:
    - "Replace the single-line composer with a multiline input that wraps and grows for longer prompts."
    - "Expose the active file, selected files, and selected text being sent as assistant context."
    - "Add verification that focused workspace context is both injected and visible to the user before submit."

- truth: "The chat drawer shows the active session clearly, lets you switch sessions or create a new one, and preserves separate conversation state per session."
  status: failed
  reason: "User reported: 隔离分支在AI对话的哪里设置？我只看到了对话分支隔离前端没有使用的指示[Image #1]"
  severity: major
  test: 3
  root_cause: "Session switching exists as a generic session strip, but the in-app copy and affordances do not explain branch/session isolation in user terms, so the feature is effectively undiscoverable from the current UI."
  artifacts:
    - path: "components/ChatPanel/AssistantSessionBar.tsx"
      issue: "Shows raw session cards and statuses without branch/isolation guidance or onboarding copy."
    - path: "components/ChatPanel/ChatHeader.tsx"
      issue: "Only shows the active session title badge, without actionable explanation of isolated conversations."
    - path: "src/app/hooks/useAssistantSessions.ts"
      issue: "Creates canonical sessions, but the UI contract does not surface why or when to use them."
  missing:
    - "Make session isolation discoverable with explicit labels, actions, and empty-state guidance in the chat UI."
    - "Show which conversation is isolated and how to create or switch threads from the primary assistant surface."
    - "Add UX-oriented tests that cover discoverability rather than only callback wiring."

- truth: "Opening the runtime inspector during or after a response shows readable session, lifecycle, stream, and context details without requiring console inspection."
  status: failed
  reason: "User reported: 设置中存在，但是流式没有输出没有效果"
  severity: major
  test: 4
  root_cause: "Runtime inspection state updates exist in the runtime and hook layers, but the only in-app affordance is a hidden toggle in the header and there is no prominent live streaming feedback path that proves inspector data is changing while the response streams."
  artifacts:
    - path: "components/ChatPanel/ChatHeader.tsx"
      issue: "Runtime inspector access is hidden behind a small icon-only toggle."
    - path: "components/ChatPanel/RuntimeInspectorPanel.tsx"
      issue: "Read-only panel depends on manual toggle and does not emphasize live streaming deltas or state transitions."
    - path: "src/app/hooks/useAssistantRuntimeInspection.ts"
      issue: "State captures streaming metadata, but the visible UI contract does not surface it prominently during active runs."
  missing:
    - "Make runtime inspection visibility and streaming-state updates obvious while a request is running."
    - "Surface live lifecycle and stream changes without requiring users to discover an icon-only control."
    - "Add regression coverage for visible streaming inspection behavior, not just static panel rendering."

- truth: "Clear chat, compact mode, stop streaming, and injected-message submission remain available in the parity-enhanced chat surface and behave normally."
  status: failed
  reason: "User reported: [Image #1]，UI中并没有任何地方可以控制上下文"
  severity: major
  test: 5
  root_cause: "The parity chat header preserves memory, compact, and runtime controls, but there is still no dedicated assistant-context control for workspace grounding, so users cannot inspect or adjust what contextual notebook data will be injected."
  artifacts:
    - path: "components/ChatPanel/ChatHeader.tsx"
      issue: "Header includes compact, memory, runtime, and clear actions but no context control."
    - path: "components/ChatPanel.tsx"
      issue: "Chat surface renders parity controls without a visible workspace-context affordance."
    - path: "src/app/hooks/useAppWorkspaceState.ts"
      issue: "Workspace context is derived in app state but never exposed as a user-manageable control."
  missing:
    - "Add a visible context control to the chat surface for inspecting and adjusting injected workspace context."
    - "Differentiate memory controls from active notebook/workspace context controls in the header."
    - "Cover context-control behavior with component and integration tests."
