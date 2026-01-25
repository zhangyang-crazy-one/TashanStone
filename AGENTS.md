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
├── .claude/                           # Claude AI 配置
│   ├── agents/                        # 自定义代理
│   │   ├── code-reviewer.md
│   │   ├── feature-developer.md
│   │   └── project-manager.md
│   ├── ccnotify/                      # 通知系统
│   ├── commands/                      # 斜杠命令
│   │   ├── bootstrap.md, commit.md, feature-start.md
│   │   ├── next.md, progress.md, start.md
│   │   └── update-status.md
│   ├── hooks/                         # 生命周期钩子
│   ├── rules/                         # 规则文件
│   │   ├── 00-global.md ~ 07-refactoring.md
│   │   ├── architecture-rules.md
│   │   └── ui-ux-rules.md
│   ├── settings.json, settings.local.json
│   └── skills/                        # 技能模块
│       ├── ai-integration/SKILL.md
│       ├── bug-debug/SKILL.md
│       ├── context7/SKILL.md
│       ├── electron-main/SKILL.md
│       ├── electron-react/SKILL.md
│       ├── mcp-tools/SKILL.md
│       ├── planning-with-files/SKILL.md, templates/
│       ├── platform-build/SKILL.md
│       ├── rag-vectordb/SKILL.md
│       ├── spec-interview/SKILL.md
│       └── ui-ux-pro-max/scripts/, SKILL.md
├── .opencode/                         # OpenCode 配置
│   ├── agent/, command/, config.json
│   └── opencode.json
├── .github/                           # GitHub 配置
│   ├── actions/, ISSUE_TEMPLATE/
│   └── workflows/                     # CI/CD 工作流
├── components/                        # React 组件 (90+ 文件)
│   ├── AISettingsModal/               # AI 设置模态框
│   │   ├── AITab.tsx, AppearanceTab.tsx, AutoUpgradeSettingsSection.tsx
│   │   ├── BackupPasswordDialog.tsx, ContextTab.tsx, EmbeddingSection.tsx
│   │   ├── KeyboardTab.tsx, McpTab.tsx, MemoryStatsSection.tsx
│   │   ├── PromptsTab.tsx, ProviderCredentialsSection.tsx
│   │   ├── SecurityTab.tsx
│   │   └── index.tsx
│   ├── App/                           # 应用容器
│   │   ├── AppOverlays.tsx, AppViewRouter.tsx, AppWorkspace.tsx
│   ├── ChatPanel/                     # AI 聊天面板
│   │   ├── ChatHeader.tsx, ChatInput.tsx, MemoryPanel.tsx
│   │   ├── MessageItem.tsx, MessageList.tsx, MessageMarkdown.tsx
│   │   ├── ToolCallDetails.tsx, ToolCallStatus.tsx
│   │   ├── index.tsx
│   │   └── useChatMemory.ts
│   ├── Preview/                       # Markdown 预览
│   │   ├── BlockReferencePreview.tsx, EnhancedImage.tsx
│   │   ├── markdownPlugins.ts, markdownUtils.ts
│   │   ├── MermaidRenderer.tsx, PreviewCodeBlock.tsx
│   │   ├── TagPreview.tsx, WikiLinkPreview.tsx
│   │   ├── index.tsx
│   │   └── useFloatingPreview.ts
│   ├── QuizPanel/                     # 测验面板
│   │   ├── quizAnswerUtils.ts, QuizBankLink.tsx
│   │   ├── quizBankUtils.ts, QuizFooter.tsx
│   │   ├── QuizHeader.tsx, QuizMistakeCollection.tsx
│   │   ├── QuizQuestionCard.tsx, index.tsx
│   │   └── useQuizMistakes.ts
│   ├── Sidebar/                       # 侧边栏
│   │   ├── FileTreeRow.tsx, SidebarContextMenu.tsx
│   │   ├── SidebarFileActions.tsx, SidebarFileOverlays.tsx
│   │   ├── SidebarFilesTab.tsx, SidebarFileTree.tsx
│   │   ├── SidebarOutlineTab.tsx, SidebarSnippetsTab.tsx
│   │   ├── SidebarStatusPanel.tsx, SidebarTabs.tsx
│   │   ├── SidebarTagsSection.tsx, sidebarTypes.ts
│   │   ├── sidebarUtils.tsx, index.tsx
│   │   └── useSidebarFileTree.ts
│   ├── context/                       # 上下文管理组件
│   │   ├── CacheMonitor.tsx, CheckpointDrawer.tsx
│   │   ├── CompactButton.tsx, ContextActionBadge.tsx
│   │   ├── TokenUsageIndicator.tsx
│   │   └── index.ts
│   ├── *.tsx                          # 独立组件文件
│   │   ├── AnalyticsDashboard.tsx, BacklinkPanel.tsx
│   │   ├── BlockReference.tsx, CodeMirrorEditor.tsx
│   │   ├── CompactMemoryPrompt.tsx, ConfirmDialog.tsx
│   │   ├── DiffView.tsx, EditorTabs.tsx
│   │   ├── KnowledgeGraph.tsx, LearningRoadmap.tsx
│   │   ├── LinkInsertModal.tsx, LoginScreen.tsx
│   │   ├── MemoryPanel.tsx, MemoryPreviewModal.tsx
│   │   ├── MindMap.tsx, QuestionBankModal.tsx
│   │   ├── RAGResultsCard.tsx, SearchModal.tsx
│   │   ├── SmartOrganizeModal.tsx, SplitEditor.tsx
│   │   ├── StreamToolCard.tsx, StudyPlanPanel.tsx
│   │   ├── SyntaxHighlight.tsx, TagsBrowser.tsx
│   │   ├── TagSuggestionModal.tsx, ThinkingCard.tsx
│   │   ├── Toast.tsx, Toolbar.tsx
│   │   ├── ToolCallCard.tsx, Tooltip.tsx
│   │   ├── VoiceTranscriptionModal.tsx, WikiLink.tsx
│   │   └── App.tsx
├── services/                          # 前端服务 (AI 服务)
│   ├── ai/                            # AI 核心服务
│   │   ├── embeddings.ts, geminiClient.ts
│   │   ├── mcpClients.ts, mcpToolGuide.ts
│   │   ├── providers/                 # AI 提供商
│   │   │   ├── anthropicProvider.ts, geminiProvider.ts
│   │   │   ├── ollamaProvider.ts, openaiProvider.ts
│   │   │   └── providerTypes.ts
│   │   ├── streamingProviders.ts, toolDefinitions.ts
│   │   └── index.ts
│   ├── aiService.ts, authService.ts, fileService.ts
│   ├── geminiService.ts, ocrService.ts, ragService.ts
│   ├── themeService.ts, toolCallAdapters.ts
│   └── toolSelector.ts
├── src/                               # 平台无关源码
│   ├── app/                           # 应用 hooks
│   │   ├── appDefaults.ts
│   │   └── hooks/                     # 30+ 应用 hooks
│   │       ├── useAIWorkflow.ts, useAppConfig.ts
│   │       ├── useAppFeatureState.ts, useAppNotifications.ts
│   │       ├── useAppServices.ts, useAppUiState.ts
│   │       ├── useAppWorkspaceState.ts, useAuthState.ts
│   │       ├── useChatHistory.ts, useEditorActions.ts
│   │       ├── useFileImports.ts, useFileOperations.ts
│   │       ├── useFileState.ts, useKeyboardShortcuts.ts
│   │       ├── useKnowledgeBase.ts, useOverlayActions.ts
│   │       ├── useStreamingUpdates.ts, useThemeState.ts
│   │       └── useWikiLinks.ts
│   ├── hooks/                         # 通用 hooks
│   │   ├── usePlatform.ts, useStorage.ts
│   │   └── useStreamingToolCalls.ts
│   ├── services/                      # 平台服务
│   │   ├── ai/platformFetch.ts
│   │   ├── context/                   # 上下文服务 (20+ 文件)
│   │   │   ├── batch-operations.ts, checkpoint.ts
│   │   │   ├── compaction.ts, config-utils.ts
│   │   │   ├── index.ts, injector.ts
│   │   │   ├── long-term-memory.ts, manager.ts
│   │   │   ├── memoryAutoUpgrade.ts, memoryCleanupService.ts
│   │   │   ├── memory-compression.ts, memory.ts
│   │   │   ├── persistent-memory.ts, project-memory.ts
│   │   │   ├── prompt-cache.ts, streaming.ts
│   │   │   ├── token-budget.ts, toolGuide.ts
│   │   │   └── types.ts
│   │   ├── deep-research/types.ts
│   │   ├── index.ts, knowledgeService.ts, mcpService.ts
│   │   ├── organize/organizeService.ts
│   │   ├── platform/platformService.ts
│   │   ├── quiz/questionBankService.ts
│   │   ├── search/searchService.ts
│   │   ├── srs/srsService.ts
│   │   ├── storage/                   # 存储服务
│   │   │   ├── electronStorage.ts, storageService.ts
│   │   │   ├── types.ts, webStorage.ts
│   │   ├── tag/tagService.ts
│   │   └── wiki/wikiLinkService.ts
│   ├── types/wiki.ts
│   └── *.css                          # 样式文件
│       ├── atom-one-dark.css, index.css
│       ├── pixel-theme.css, vite-env.d.ts
│       └── streamingUtils.ts
├── electron/                          # Electron 主进程
│   ├── database/                      # SQLite 数据库
│   │   ├── index.ts, migrations.ts
│   │   └── repositories/              # 数据仓库 (10+ 文件)
│   │       ├── authRepository.ts, chatRepository.ts
│   │       ├── configRepository.ts, contextRepository.ts
│   │       ├── fileRepository.ts, mistakeRepository.ts
│   │       ├── themeRepository.ts, vectorRepository.ts
│   │       └── *.test.md
│   ├── ipc/                           # IPC 处理器
│   │   ├── aiHandlers.ts, backupHandlers.ts
│   │   ├── contextHandlers.ts, dbHandlers.ts
│   │   ├── fileHandlers.ts, index.ts
│   │   ├── lancedbHandlers.ts, ocrHandlers.ts
│   │   ├── sherpaHandlers.ts, whisperHandlers.ts
│   ├── lancedb/index.ts, main.ts, preload.ts
│   ├── mcp/                           # MCP 协议
│   │   ├── handlers.ts, index.ts
│   │   ├── MCPClient.ts, types.ts
│   ├── memory/persistentMemoryService.ts
│   ├── ocr/index.ts
│   ├── sherpa/                        # 语音识别
│   │   ├── audioProcessor.ts, index.ts
│   ├── types/ipc.ts
│   ├── utils/                         # 工具函数
│   │   ├── logger.ts, paths.ts
│   └── whisper/index.ts
├── test/                              # 测试文件
│   ├── components/                    # 组件测试
│   │   ├── ConfirmDialog.test.tsx, EditorTabs.test.tsx
│   │   ├── Sidebar.test.tsx, Toast.test.tsx
│   │   ├── Toolbar.test.tsx, WikiLink.test.tsx
│   ├── knowledge/tag.test.ts
│   ├── memory/                        # 内存测试
│   │   ├── memory.integration.test.ts
│   │   ├── memory.unit.test.ts, README.md
│   ├── services/                      # 服务测试
│   │   ├── aiService.toolEvents.test.ts, fileService.test.ts
│   │   ├── srsService.test.ts, streamingSupport.test.ts
│   │   ├── streamingToolAdapter.test.ts
│   │   ├── themeService.test.ts, toolCallAdapters.test.ts
│   │   └── toolSelector.test.ts
│   ├── setup.ts, vitest.d.ts
│   └── wiki/wikiLink.test.ts
├── docs/                              # 文档
│   ├── CODE_REVIEW.md, PROJECT.md, PROJECT_STATUS.md
│   ├── issues/                        # 问题文档
│   ├── TEMPLATE/                      # 模板
│   ├── TODO.md, V1.75_*.md
│   ├── deepresearch-integration-plan.md
│   ├── utils/                         # 工具文档
│   │   ├── BUILD_MAC.md, MCP_USAGE.md
│   │   └── User_Guide.md
│   └── mcp-config-example.json
├── planning/                          # 规划文档
│   ├── architecture_design.md, findings.md
│   ├── logging_plan.md, progress.md
│   ├── task_plan.md
│   └── tool-call-unification/
├── hooks/                             # 遗留 hooks
│   └── useSpeechRecognition.ts
├── utils/                             # 工具函数
│   ├── base64.ts, escapeHtml.ts, jsonHelpers.ts
│   ├── parseToolCalls.ts, slug.ts
│   └── translations.ts
├── .env.template, .gitignore
├── AGENTS.md, App.tsx, CHANGELOG.md
├── electron-builder.yml, index.tsx
├── opencode.json, package.json
├── playwright.config.ts, postcss.config.js
├── README.md, tsconfig.json
├── types.ts, types.d.ts, vitest.config.ts
├── vite.config.ts, .claude/settings.json
├── .github/workflows/, .github/dependabot.yml
├── .github/ISSUE_TEMPLATE/, .github/PULL_REQUEST_TEMPLATE.md
└── resources/                         # 资源文件 (模型文件)
```

## Key Files Reference

| Purpose | File |
|---------|------|
| **Main Entry** | `electron/main.ts`, `App.tsx`, `index.tsx` |
| **Types** | `types.ts`, `src/types/wiki.ts` |
| **AI Service** | `services/aiService.ts`, `services/ai/providers/*.ts` |
| **Context Services** | `src/services/context/*.ts` |
| **Database** | `electron/database/index.ts`, `electron/database/repositories/*.ts` |
| **IPC Handlers** | `electron/ipc/index.ts`, `electron/ipc/*.ts` |
| **Storage** | `src/services/storage/*.ts`, `src/services/context/persistent-memory.ts` |
| **Tests** | `test/setup.ts`, `test/services/*.test.ts` |
| **Config** | `vite.config.ts`, `tsconfig.json`, `electron-builder.yml` |

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
