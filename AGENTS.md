# AGENTS.md - TashaStone Codebase Guide

> AI-powered Markdown Editor with Knowledge Management
> Version: 1.7.x | Stack: Electron 33 + React 19 + TypeScript + Tailwind CSS v4

## Build & Development Commands

**IMPORTANT: Use `bun` for all TypeScript build and test operations.**

### Using bun (Recommended)

```bash
# Install dependencies
bun install

# Run tests
bun run bun:test

# Development
bun run bun:dev              # Vite dev server (web only)
bun run bun:dev:electron     # Full Electron development mode

# Build
bun run bun:build            # Build frontend only
bun run bun:build:electron   # Build complete Electron app

# Package for distribution
bun run bun:dist             # Build all platforms
bun run bun:dist:win         # Windows installer (.exe)
bun run bun:dist:mac         # macOS installer (.dmg)
bun run bun:dist:linux       # Linux packages (.deb, .AppImage)
bun run bun:dist:all         # Windows + Linux
```

### Using npm (Legacy)

```bash
# Development
npm run dev              # Vite dev server (web only)
npm run dev:electron     # Full Electron development mode

# Build
npm run build            # Build frontend only
npm run build:electron   # Build complete Electron app

# Package for distribution
npm run dist             # Build all platforms
npm run dist:win         # Windows installer (.exe)
npm run dist:mac         # macOS installer (.dmg)
npm run dist:linux       # Linux packages (.deb, .AppImage)
```

## Testing

Uses **Vitest** with jsdom environment and React Testing Library.

**Always use bun for running tests:**

```bash
# Run all tests (recommended)
bun run bun:test

# Run tests in watch mode
bun run vitest

# Run a single test file
bun run vitest run test/services/srsService.test.ts

# Run tests matching a pattern
bun run vitest run --testNamePattern="SRS Service"

# Run with coverage
bun run vitest run --coverage
```

**Test file locations**: `test/**/*.test.ts`, `test/**/*.test.tsx`

## Code Style Guidelines

### TypeScript Configuration

- **Target**: ES2022
- **Module**: ESNext with bundler resolution
- **Strict mode**: Enabled (no `any` types)
- **Path alias**: `@/*` maps to project root

### Imports

```typescript
// 1. React imports first
import React, { useState, useEffect, useCallback, memo } from 'react';

// 2. Third-party libraries
import ReactMarkdown from 'react-markdown';
import { List } from 'react-window';

// 3. Internal types (from types.ts)
import { ChatMessage, AIState, MarkdownFile } from '../types';

// 4. Internal components/services (use @/ alias)
import { RAGResultsCard } from '@/components/RAGResultsCard';
import { mcpService } from '@/src/services/mcpService';

// 5. Utils and translations
import { translations, Language } from '@/utils/translations';
```

### Component Structure

```typescript
// Interface first, then component
interface ComponentProps {
  isOpen: boolean;
  onClose: () => void;
  data: SomeType[];
}

export function ComponentName({ isOpen, onClose, data }: ComponentProps) {
  // 1. State declarations
  const [loading, setLoading] = useState(false);
  
  // 2. Custom hooks
  const platform = usePlatform();
  
  // 3. Effects
  useEffect(() => {
    // Effect logic
    return () => { /* cleanup */ };
  }, [dependencies]);
  
  // 4. Callbacks (memoized)
  const handleAction = useCallback(async () => {
    // Handler logic
  }, [dependencies]);
  
  // 5. Render
  return (
    <div className="component-class">
      {/* JSX */}
    </div>
  );
}
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Components | PascalCase | `ChatPanel.tsx`, `RAGResultsCard` |
| Hooks | camelCase with `use` prefix | `usePlatform`, `useStorage` |
| Services | camelCase with `Service` suffix | `aiService`, `mcpService` |
| Types/Interfaces | PascalCase | `MarkdownFile`, `AIConfig` |
| Constants | SCREAMING_SNAKE_CASE | `DEFAULT_THEMES`, `SRS_INTERVALS` |
| IPC Handlers | `namespace:action` pattern | `'file:openDialog'`, `'ai:chat'` |

### Error Handling

```typescript
// Frontend - use try/catch with typed errors
try {
  const result = await window.electronAPI.ipcInvoke('ai:chat', params);
  return result;
} catch (error) {
  console.error('Chat failed:', error);
  showToast?.('Operation failed', true);
  throw error;
}

// Electron main - use logger
import { logger } from './utils/logger.js';

try {
  await operation();
} catch (error) {
  logger.error('Operation failed:', error);
  throw error;
}
```

### Electron IPC Communication

```typescript
// Frontend: Always use window.electronAPI
const result = await window.electronAPI.ipcInvoke('namespace:action', params);

// Never import electron directly in React components
// WRONG: import { ipcRenderer } from 'electron';
```

### Type Definitions

All shared types live in `types.ts` at project root:
- `MarkdownFile` - Document with metadata
- `ViewMode` - Editor view modes (enum)
- `AIConfig` - AI provider configuration
- `ChatMessage` - Chat message structure
- `ThemeColors` - Theme color definitions

## Project Architecture

```
TashaStone/
├── components/          # React UI components
├── services/            # Frontend services (AI, auth, file, etc.)
├── src/
│   ├── hooks/           # Custom React hooks
│   └── services/        # Platform-aware services
├── electron/
│   ├── main.ts          # Electron main process entry
│   ├── preload.ts       # Preload script (IPC bridge)
│   ├── ipc/             # IPC handlers by domain
│   ├── database/        # SQLite repositories
│   ├── lancedb/         # Vector database
│   └── mcp/             # MCP protocol implementation
├── test/                # Vitest test files
├── types.ts             # Shared TypeScript types
└── utils/               # Utility functions
```

## Forbidden Patterns

- **No `any` types** - Use `unknown` if type is truly unknown
- **No `@ts-ignore`** - Fix the type error properly
- **No direct Electron imports** in React - Use `window.electronAPI`
- **No `async` in useEffect** directly - Use inner async function
- **No class components** - Use functional components with hooks

## Performance Patterns

```typescript
// Use memo for expensive components
const MessageItem = memo(({ message }: { message: ChatMessage }) => {
  return <div>{message.content}</div>;
});

// Use useCallback for handlers passed as props
const handleSend = useCallback(async (text: string) => {
  await sendMessage(text);
}, [sendMessage]);

// Use virtual scrolling for long lists
import { List } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
```

## AI Provider Integration

Supports multiple providers via `AIConfig`:
- **Google Gemini** - Primary, with MCP tool support
- **Ollama** - Local inference
- **OpenAI Compatible** - DeepSeek, GLM-4, etc.
- **Anthropic Compatible** - Claude models

## Key Files Reference

| Purpose | File |
|---------|------|
| Main types | `types.ts` |
| AI service | `services/aiService.ts` |
| Electron entry | `electron/main.ts` |
| IPC registry | `electron/ipc/index.ts` |
| Platform hooks | `src/hooks/usePlatform.ts` |
| Translations | `utils/translations.ts` |
| Test setup | `test/setup.ts` |
| Vitest config | `vitest.config.ts` |
| Vite config | `vite.config.ts` |
