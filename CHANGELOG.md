# Changelog

## v1.7.8
- Added quiz creation from selected question bank items (cross-bank selection) to avoid redundant AI generation.
- Restored quiz exit to return to the previous view mode for smoother preview workflows.
- Added large-document preview performance mode with optional full rendering.

## v1.7.7
- Added unified tool-call adapters for Gemini, OpenAI compatible, Ollama, and Anthropic providers.
- Added tool event callbacks to surface non-streaming tool execution status in the chat UI.
- Added unit tests for tool-call adapters and tool event flow.
- Updated README download links to v1.7.7.
- Hotfix: improved streaming tool-call rendering, OpenAI-compatible tool follow-ups, and surfaced 400 error details for debugging.
