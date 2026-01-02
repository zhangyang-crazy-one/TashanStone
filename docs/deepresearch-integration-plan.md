# DeepResearch 功能集成计划

> **版本**: v1.1 (更新)  
> **日期**: 2025-12-30  
> **状态**: 规划阶段  
> **作者**: Enhanced-Plan Agent

## 概述

### 目标
将 DeepResearch (Alibaba-NLP) 的核心功能使用纯 TypeScript 重构，集成到 TashaStone 作为内置深度研究工具。

### 核心特性
| 功能 | 说明 |
|------|------|
| **ReAct Agent** | Think → Action → Observe 循环推理 |
| **Web 搜索** | Playwright 无头浏览器自动化 |
| **页面读取** | Playwright DOM 内容提取 |
| **学术搜索** | arXiv API 集成 |
| **文档解析** | 复用现有 PDF.js 实现 |
| **代码执行** | 主进程沙箱 Python 执行（禁用 os/sys，保留缓存写入） |

### 菜单位置
```
顶部菜单: AI → 深度研究 (Deep Research)
         ↓
    独立页面 (类似语音转录页面)
         ├── 研究历史侧边栏
         ├── 主研究区域
         └── 研究结果展示
```

### 技术栈
```
┌─────────────────────────────────────────────────────────────┐
│                    前端 (React 19)                          │
│  DeepResearchPage.tsx  │  ResearchHistory.tsx  │ ResultView │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────┴─────────────────────────────┐
│                  服务层 (TypeScript)                       │
│  DeepResearchAgent.ts  │  ReActEngine.ts  │  ToolSystem.ts │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────┴─────────────────────────────┐
│                Electron 主进程 (TypeScript)                │
│  PlaywrightService.ts  │  ArXivService.ts  │  PythonSandbox│
└─────────────────────────────────────────────────────────────┘
                              │
                    APP 主模型 (Gemini/Ollama/OpenAI)
```

## 技术方案

### 1. Playwright 集成

#### Web 搜索工具
```typescript
// electron/playwright/WebSearchTool.ts
import { chromium, Browser, Page } from 'playwright';

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

class WebSearchTool {
  private browser: Browser | null = null;
  private page: Page | null = null;

  async initialize(): Promise<void> {
    this.browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    this.page = await this.browser.newPage();
  }

  async search(query: string): Promise<SearchResult[]> {
    // 使用 Google 搜索或 Bing 搜索
    await this.page.goto(`https://www.google.com/search?q=${encodeURIComponent(query)}`);
    
    const results = await this.page.evaluate(() => {
      // 解析搜索结果
    });
    
    return results;
  }

  async dispose(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
    }
  }
}
```

#### 页面读取工具
```typescript
// electron/playwright/PageVisitTool.ts
interface VisitResult {
  title: string;
  content: string;
  links: string[];
  images: string[];
}

class PageVisitTool {
  async visit(url: string): Promise<VisitResult> {
    await this.page.goto(url, { waitUntil: 'networkidle' });
    
    const result = await this.page.evaluate(() => {
      // 提取页面主要内容
      const content = document.querySelector('main')?.innerText || 
                      document.body.innerText;
      
      return {
        title: document.title,
        content: content.substring(0, 10000), // 限制长度
        links: Array.from(document.querySelectorAll('a')).map(a => a.href),
        images: Array.from(document.querySelectorAll('img')).map(img => img.src)
      };
    });
    
    return result;
  }
}
```

#### Electron 主进程集成
```typescript
// electron/playwright/index.ts
import { ipcMain, webContents } from 'electron';
import { BrowserWindow } from 'electron/main';

class PlaywrightService {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  async initialize(): Promise<void> {
    this.browser = await chromium.launch({
      headless: true,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    });
    
    this.context = await this.browser.newContext();
  }

  // IPC 处理程序
  setupIPCHandlers(): void {
    ipcMain.handle('playwright:search', async (event, query: string) => {
      return this.webSearch(query);
    });

    ipcMain.handle('playwright:visit', async (event, url: string) => {
      return this.visitPage(url);
    });

    ipcMain.handle('playwright:extract', async (event, selector: string) => {
      return this.extractContent(selector);
    });
  }
}
```

### 2. arXiv 学术搜索

```typescript
// electron/arXiv/ArXivService.ts
import { parseString } from 'xml2js';

interface ArXivPaper {
  id: string;
  title: string;
  authors: string[];
  abstract: string;
  published: string;
  categories: string[];
  pdfUrl: string;
  comment?: string;
}

class ArXivService {
  private baseUrl = 'http://export.arxiv.org/api/query';

  async search(query: string, maxResults = 10): Promise<ArXivPaper[]> {
    const searchQuery = `all:${encodeURIComponent(query)}`;
    const url = `${this.baseUrl}?search_query=${searchQuery}&max_results=${maxResults}`;
    
    const response = await fetch(url);
    const xml = await response.text();
    
    // 解析 XML
    const papers = await this.parseArXivResponse(xml);
    return papers;
  }

  async getPaperById(id: string): Promise<ArXivPaper | null> {
    const url = `${this.baseUrl}?id_list=${id}`;
    const response = await fetch(url);
    const xml = await response.text();
    
    const papers = await this.parseArXivResponse(xml);
    return papers[0] || null;
  }

  private parseArXivResponse(xml: string): Promise<ArXivPaper[]> {
    return new Promise((resolve, reject) => {
      parseString(xml, { explicitArray: false }, (err, result) => {
        if (err) {
          reject(err);
          return;
        }

        const entries = result.feed.entry;
        const papers: ArXivPaper[] = (Array.isArray(entries) ? entries : [entries]).map(entry => ({
          id: entry.id.replace('http://arxiv.org/abs/', ''),
          title: entry.title.replace(/\n/g, ' ').trim(),
          authors: Array.isArray(entry.author) 
            ? entry.author.map((a: any) => a.name)
            : [entry.author.name],
          abstract: entry.summary.replace(/\n/g, ' ').trim(),
          published: entry.published,
          categories: Array.isArray(entry.category)
            ? entry.category.map((c: any) => c.$.term)
            : [entry.category.$.term],
          pdfUrl: entry.link.find((l: any) => l.$.title === 'pdf').$.href,
          comment: entry.arxiv_comment
        }));

        resolve(papers);
      });
    });
  }
}
```

### 3. PDF 文档解析 (复用现有实现)

```typescript
// electron/pdf/PDFService.ts
import { readFile } from 'fs/promises';
import * as pdfjsLib from 'pdfjs-dist';

interface PDFPage {
  pageNum: number;
  text: string;
}

interface PDFDocument {
  numPages: number;
  title: string;
  pages: PDFPage[];
}

class PDFService {
  // 复用 services/fileService.ts 中的 PDF 解析逻辑
  async parsePDF(filePath: string): Promise<PDFDocument> {
    const arrayBuffer = await readFile(filePath);
    
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pages: PDFPage[] = [];
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const text = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      
      pages.push({ pageNum: i, text });
    }
    
    return {
      numPages: pdf.numPages,
      title: '',
      pages
    };
  }

  // OCR 支持
  async parsePDFWithOCR(filePath: string, useLocalOCR = true): Promise<PDFDocument> {
    // 复用现有 OCR 逻辑
    // 优先使用本地 PaddleOCR
    // 备选使用云端 API
  }
}
```

### 4. Python 沙箱 (Electron 主进程)

```typescript
// electron/python/PythonSandbox.ts
import { spawn, ChildProcess } from 'child_process';
import { writeFile, readFile, unlink, mkdir } from 'fs/promises';
import { tmpdir, homedir } from 'os';
import { join } from 'path';

interface PythonResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  executionTime: number;
}

class PythonSandbox {
  private readonly MAX_EXECUTION_TIME = 30000; // 30秒
  private readonly MAX_OUTPUT_SIZE = 100000; // 100KB
  private readonly CACHE_DIR = join(homedir(), '.tashanstone', 'deep-research', 'cache');

  constructor() {
    // 初始化缓存目录
    this.initCacheDir();
  }

  private async initCacheDir(): Promise<void> {
    try {
      await mkdir(this.CACHE_DIR, { recursive: true });
    } catch {
      // 忽略错误
    }
  }

  async execute(code: string, timeout = this.MAX_EXECUTION_TIME): Promise<PythonResult> {
    const startTime = Date.now();
    const tempFile = join(tmpdir(), `python_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.py`);
    const cacheFile = join(this.CACHE_DIR, `cache_${Date.now()}.json`);

    try {
      // 写入临时文件
      await writeFile(tempFile, this.wrapCode(code, cacheFile));

      // 创建进程
      const process = spawn('python', [tempFile], {
        cwd: tmpdir(),
        env: {
          ...process.env,
          PYTHONUNBUFFERED: '1',
          // 禁用 os 和 sys 模块
          PYTHONPATH: ''
        }
      });

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
        if (stdout.length > this.MAX_OUTPUT_SIZE) {
          process.kill();
        }
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      // 超时控制
      const timeoutPromise = new Promise<PythonResult>((_, reject) => {
        setTimeout(() => {
          process.kill();
          reject(new Error('Execution timeout'));
        }, timeout);
      });

      const resultPromise = new Promise<PythonResult>((resolve) => {
        process.on('close', (code) => {
          resolve({
            stdout,
            stderr,
            exitCode: code || 0,
            executionTime: Date.now() - startTime
          });
        });
      });

      return await Promise.race([resultPromise, timeoutPromise]);

    } finally {
      // 清理临时文件
      try {
        await unlink(tempFile);
      } catch {
        // 忽略删除错误
      }
    }
  }

  private wrapCode(code: string, cacheFile: string): string {
    return `
import sys
import json
import time
import math
import os  # 禁用 - 已移除
import builtins

# 安全模式：捕获所有输出
stdout_backup = sys.stdout
stderr_backup = sys.stderr

# 禁用危险模块
class SafeModuleChecker:
    def __init__(self):
        self.disabled_modules = {'os', 'sys', 'subprocess', 'shutil', 'pickle', 'marshal'}
    
    def __getattr__(self, name):
        if name in self.disabled_modules:
            raise AttributeError(f"Module '{name}' is disabled for security reasons")
        return getattr(builtins, name)

sys.modules['os'] = SafeModuleChecker()
sys.modules['sys'] = SafeModuleChecker()

# 安全的缓存系统
class SafeCache:
    def __init__(self, cache_file):
        self.cache_file = cache_file
        self.data = {}
        self._load()
    
    def _load(self):
        try:
            with open(self.cache_file, 'r') as f:
                self.data = json.load(f)
        except:
            self.data = {}
    
    def save(self, key, value):
        self.data[key] = {
            'value': value,
            'timestamp': time.time()
        }
        try:
            with open(self.cache_file, 'w') as f:
                json.dump(self.data, f, indent=2)
        except:
            pass
    
    def get(self, key, default=None):
        return self.data.get(key, {}).get('value', default)

class SafeOutput:
    def __init__(self):
        self.content = []
    
    def write(self, text):
        if len(''.join(self.content)) < 100000:
            self.content.append(text)
        return len(text)
    
    def flush(self):
        pass

sys.stdout = SafeOutput()
sys.stderr = SafeOutput()

# 创建全局缓存实例
cache = SafeCache("${cacheFile.replace(/\\/g, '\\\\')}")

# 执行用户代码
try:
${code.split('\n').map(line => '    ' + line).join('\n')}
except Exception as e:
    print(f"Error: {type(e).__name__}: {str(e)}", file=stderr_backup)

# 输出结果
print("__OUTPUT_START__")
print(json.dumps({
    "stdout": ''.join(sys.stdout.content),
    "stderr": ''.join(sys.stderr.content),
    "timestamp": time.time()
}), file=stdout_backup)
    `;
  }
}
```

### 5. DeepResearch Agent 核心

```typescript
// src/services/deep-research/DeepResearchAgent.ts
import { v4 as uuidv4 } from 'uuid';

// 消息类型
interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ToolCall {
  name: string;
  arguments: Record<string, any>;
}

interface ResearchResult {
  question: string;
  answer: string;
  messages: Message[];
  prediction: string;
  termination: string;
  sources: ResearchSource[];
}

interface ResearchSource {
  type: 'web' | 'arxiv' | 'pdf' | 'code';
  url?: string;
  title: string;
  content: string;
}

class DeepResearchAgent {
  private config: DeepResearchConfig;
  private tools: Map<string, BaseTool>;
  private conversationHistory: Message[];

  constructor(config: DeepResearchConfig) {
    this.config = config;
    this.tools = new Map();
    this.conversationHistory = [];
  }

  // 注册工具
  registerTool(name: string, tool: BaseTool): void {
    this.tools.set(name, tool);
  }

  // 核心 ReAct 循环
  async research(question: string): Promise<ResearchResult> {
    const startTime = Date.now();
    const sources: ResearchSource[] = [];
    
    // 初始化消息
    this.conversationHistory = [
      {
        role: 'system',
        content: this.buildSystemPrompt()
      },
      {
        role: 'user',
        content: question
      }
    ];

    let numLlCallsAvailable = this.config.maxLlCallsPerRun || 100;
    let round = 0;

    while (numLlCallsAvailable > 0) {
      // 检查超时
      if (Date.now() - startTime > this.config.timeout * 60 * 1000) {
        return this.buildResult(question, 'No answer found after timeout', 'timeout', sources);
      }

      round++;
      numLlCallsAvailable--;

      // 调用 LLM
      const response = await this.callLLM(this.conversationHistory);
      
      // 添加助手响应
      this.conversationHistory.push({
        role: 'assistant',
        content: response.content
      });

      // 检查是否有工具调用
      const toolCall = this.parseToolCall(response.content);
      
      if (toolCall) {
        // 执行工具
        const toolResult = await this.executeTool(toolCall, sources);
        
        // 添加工具结果到对话
        this.conversationHistory.push({
          role: 'user',
          content: `<tool_response>\n${toolResult}\n</tool_response>`
        });
        
        continue;
      }

      // 检查是否有答案
      const answer = this.parseAnswer(response.content);
      if (answer) {
        return this.buildResult(question, answer, 'answer', sources);
      }

      // 检查 Token 限制
      const tokenCount = await this.countTokens(this.conversationHistory);
      if (tokenCount > this.config.maxTokens) {
        const finalResponse = await this.forceAnswerGeneration();
        const answer = this.parseAnswer(finalResponse.content);
        return this.buildResult(question, answer || 'Token limit reached', 'token_limit', sources);
      }
    }

    return this.buildResult(question, 'Max calls exceeded', 'exhausted', sources);
  }

  private async callLLM(messages: Message[]): Promise<{ content: string }> {
    // 使用 APP 的主模型 (Gemini/Ollama/OpenAI)
    return await this.aiService.chat(messages, {
      temperature: 0.6,
      maxTokens: 10000,
      model: this.config.model
    });
  }

  private parseToolCall(content: string): ToolCall | null {
    const toolCallMatch = content.match(/<tool_call>([\s\S]*?)<\/tool_call>/);
    if (!toolCallMatch) return null;

    try {
      const toolCallText = toolCallMatch[1];
      
      // 检查是否是 Python 代码
      if (toolCallText.toLowerCase().includes('python')) {
        const codeMatch = toolCallText.match(/<code>([\s\S]*?)<\/code>/);
        if (codeMatch) {
          return {
            name: 'python_interpreter',
            arguments: { code: codeMatch[1] }
          };
        }
      }

      // JSON 格式的工具调用
      const toolCall = JSON.parse(toolCallText);
      return {
        name: toolCall.name,
        arguments: toolCall.arguments || {}
      };
    } catch {
      return null;
    }
  }

  private async executeTool(toolCall: ToolCall, sources: ResearchSource[]): Promise<string> {
    const tool = this.tools.get(toolCall.name);
    if (!tool) {
      return `Error: Tool '${toolCall.name}' not found`;
    }

    try {
      const result = await tool.execute(toolCall.arguments);
      
      // 记录来源
      if (toolCall.name === 'web_search') {
        sources.push({
          type: 'web',
          url: toolCall.arguments.url,
          title: 'Search Results',
          content: result
        });
      } else if (toolCall.name === 'arxiv_search') {
        sources.push({
          type: 'arxiv',
          title: 'ArXiv Paper',
          content: result
        });
      }
      
      return result;
    } catch (error) {
      return `Error executing ${toolCall.name}: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  private parseAnswer(content: string): string | null {
    const answerMatch = content.match(/<answer>([\s\S]*?)<\/answer>/);
    return answerMatch ? answerMatch[1].trim() : null;
  }

  private buildSystemPrompt(): string {
    return `You are a Deep Research Agent capable of performing comprehensive research tasks.

## Your Capabilities
1. **Web Search**: Search the internet for current information
2. **Page Visit**: Read and extract content from web pages
3. **ArXiv Search**: Find academic papers on arXiv
4. **PDF Parsing**: Parse and analyze PDF documents
5. **Python Execution**: Execute Python code for calculations and analysis

## Workflow
1. Analyze the user's research question
2. Use tools to gather relevant information
3. Synthesize findings and provide a comprehensive answer
4. Cite all sources used in your research

## Response Format
- Use <tool_call>...</tool_call> tags for tool invocations
- Use <answer>...</answer> tags for your final answer
- Be thorough and cite sources

Current date: ${new Date().toISOString().split('T')[0]}`;
  }

  private buildResult(question: string, prediction: string, termination: string, sources: ResearchSource[]): ResearchResult {
    return {
      question,
      answer: prediction,
      messages: this.conversationHistory,
      prediction,
      termination,
      sources
    };
  }
}
```

### 6. 工具基类

```typescript
// src/services/deep-research/tools/BaseTool.ts
interface ToolResult {
  success: boolean;
  content: string;
  error?: string;
}

abstract class BaseTool {
  abstract name: string;
  abstract description: string;
  abstract parameters: ToolParameter[];

  abstract execute(args: Record<string, any>): Promise<string>;

  protected formatResult(result: ToolResult): string {
    if (result.success) {
      return result.content;
    }
    return `Error: ${result.error}`;
  }
}

interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required: boolean;
}
```

### 7. 具体工具实现

```typescript
// src/services/deep-research/tools/WebSearchTool.ts
class WebSearchTool extends BaseTool {
  name = 'web_search';
  description = 'Search the web for information';
  parameters = [
    { name: 'query', type: 'string', description: 'Search query', required: true }
  ];

  async execute(args: { query: string }): Promise<string> {
    const results = await this.playwrightService.search(args.query);
    
    return results.map(r => 
      `[${r.title}](${r.url})\n${r.snippet}\n`
    ).join('\n---\n');
  }
}

// src/services/deep-research/tools/PageVisitTool.ts
class PageVisitTool extends BaseTool {
  name = 'page_visit';
  description = 'Visit a webpage and extract its content';
  parameters = [
    { name: 'url', type: 'string', description: 'URL to visit', required: true }
  ];

  async execute(args: { url: string }): Promise<string> {
    const content = await this.playwrightService.visitPage(args.url);
    return `Title: ${content.title}\n\n${content.content}`;
  }
}

// src/services/deep-research/tools/ArXivSearchTool.ts
class ArXivSearchTool extends BaseTool {
  name = 'arxiv_search';
  description = 'Search arXiv for academic papers';
  parameters = [
    { name: 'query', type: 'string', description: 'Search query', required: true },
    { name: 'maxResults', type: 'number', description: 'Max results', required: false }
  ];

  async execute(args: { query: string; maxResults?: number }): Promise<string> {
    const papers = await this.arXivService.search(args.query, args.maxResults || 5);
    
    return papers.map(p => 
      `**${p.title}**\nAuthors: ${p.authors.join(', ')}\nAbstract: ${p.abstract}\n[PDF](${p.pdfUrl})\n`
    ).join('\n---\n');
  }
}

// src/services/deep-research/tools/PDFParserTool.ts
class PDFParserTool extends BaseTool {
  name = 'parse_pdf';
  description = 'Parse and extract text from PDF documents';
  parameters = [
    { name: 'filePath', type: 'string', description: 'Path to PDF file', required: true }
  ];

  async execute(args: { filePath: string }): Promise<string> {
    const pdf = await this.pdfService.parsePDF(args.filePath);
    return pdf.pages.map(p => `Page ${p.pageNum}: ${p.text}`).join('\n\n');
  }
}

// src/services/deep-research/tools/PythonInterpreterTool.ts
class PythonInterpreterTool extends BaseTool {
  name = 'python_interpreter';
  description = 'Execute Python code for calculations and analysis';
  parameters = [
    { name: 'code', type: 'string', description: 'Python code to execute', required: true }
  ];

  async execute(args: { code: string }): Promise<string> {
    const result = await this.pythonSandbox.execute(args.code);
    return `stdout: ${result.stdout}\nstderr: ${result.stderr}`;
  }
}
```

## 架构设计

### 目录结构

```
src/services/deep-research/
├── index.ts                           # 导出入口
├── DeepResearchAgent.ts               # 主 Agent 类
├── ReActEngine.ts                     # ReAct 循环引擎
├── ContextManager.ts                  # 上下文/Token 管理
├── ToolDispatcher.ts                  # 工具分发器
├── types.ts                           # 类型定义
└── tools/
    ├── BaseTool.ts                    # 工具基类
    ├── WebSearchTool.ts               # Web 搜索工具
    ├── PageVisitTool.ts               # 页面读取工具
    ├── ArXivSearchTool.ts             # arXiv 搜索工具
    ├── PDFParserTool.ts               # PDF 解析工具
    └── PythonInterpreterTool.ts       # Python 执行工具

electron/
├── playwright/
│   ├── index.ts                       # Playwright 服务
│   ├── WebSearchTool.ts               # Web 搜索 IPC
│   └── PageVisitTool.ts               # 页面读取 IPC
├── arXiv/
│   └── ArXivService.ts                # arXiv API 服务
├── pdf/
│   └── PDFService.ts                  # PDF 解析服务
├── python/
│   └── PythonSandbox.ts               # Python 沙箱
└── ipc/
    └── deepResearchHandlers.ts        # IPC 处理器

components/deep-research/
├── DeepResearchPage.tsx               # 深度研究页面 (类似语音转录页面)
├── ResearchHistory.tsx                # 研究历史侧边栏
├── ResearchChat.tsx                   # 研究对话区域
├── ResearchResults.tsx                # 研究结果展示
├── ResearchInput.tsx                  # 研究问题输入
├── ResearchProgress.tsx               # 研究进度显示
└── index.ts                           # 导出入口

# 菜单位置
App.tsx
└── 顶部导航栏
    └── AI 菜单
        └── 深度研究 (打开 DeepResearchPage)
```

### UI 设计

#### 页面布局 (类似 VoiceTranscriptionModal)

```
┌─────────────────────────────────────────────────────────────────────┐
│  深度研究 (Deep Research)                                  [X]   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────┐  ┌─────────────────────────────────┐  │
│  │ 研究历史                │  │                                 │  │
│  │                         │  │    [研究问题输入框]              │  │
│  │ 🔬 人工智能发展趋势     │  │                                 │  │
│  │   2025-12-30 10:30     │  │    [开始研究      ]              │  │
│  │                         │  │                                 │  │
│  │ 🔬 量子计算应用前景     │  │  ┌─────────────────────────────┐│  │
│  │   2025-12-29 14:20     │  │  │                             ││  │
│  │                         │  │  │  🔄 正在进行深度研究...      ││  │
│  │ 🔬 RAG 技术架构         │  │  │                             ││  │
│  │   2025-12-28 09:15     │  │  │  Step 1: 🔍 Web 搜索         ││  │
│  │                         │  │  │  Step 2: 📄 页面读取         ││  │
│  │ 🔬 Claude Code 使用     │  │  │  Step 3: 📊 结果分析         ││  │
│  │   2025-12-27 16:45     │  │  │                             ││  │
│  │                         │  │  └─────────────────────────────┘│  │
│  │ [清空历史]              │  │                                 │  │
│  └─────────────────────────┘  └─────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

#### 组件结构

```typescript
// 组件层级
DeepResearchPage (主页面)
├── ResearchHistory (左侧历史栏)
│   ├── ResearchHistoryItem (历史项)
│   └── ClearHistoryButton (清空按钮)
├── ResearchChat (主对话区域)
│   ├── ResearchInput (输入框 + 开始按钮)
│   ├── ResearchProgress (进度显示)
│   └── ResearchResult (结果展示)
│       ├── SourceList (来源列表)
│       ├── AnswerCard (答案卡片)
│       └── ActionButtons (复制/分享按钮)
└── ResearchStatus (状态指示器)
```

#### 交互流程

```
1. 用户点击顶部菜单 "AI" → "深度研究"
   ↓
2. 打开 DeepResearchPage 页面
   ↓
3. 用户在输入框输入研究问题
   ↓
4. 点击 "开始研究" 按钮
   ↓
5. 显示研究进度 (多步骤)
   ↓
6. 实时显示中间结果
   ↓
7. 研究完成，显示完整答案
   ↓
8. 结果保存到研究历史
```

## 实施步骤

### Phase 1: 核心架构 (2天)
- [ ] 创建项目结构和基础类型定义
- [ ] 实现 DeepResearchAgent 核心类
- [ ] 实现 ReAct 循环引擎
- [ ] 实现上下文管理和 Token 计数
- [ ] 基础工具基类和接口

### Phase 2: 主进程服务 (3天)
- [ ] 实现 Playwright 服务 (Web 搜索 + 页面读取)
- [ ] 实现 arXiv API 服务
- [ ] 集成现有 PDF 解析服务
- [ ] 实现 Python 沙箱 (禁用 os/sys，保留缓存)
- [ ] 主进程 IPC 处理器

### Phase 3: 前端页面 (3天)
- [ ] 创建 DeepResearchPage 页面框架
- [ ] 实现 ResearchHistory 侧边栏
- [ ] 实现 ResearchChat 对话组件
- [ ] 实现 ResearchInput 输入组件
- [ ] 实现 ResearchProgress 进度组件
- [ ] 实现 ResearchResult 结果展示
- [ ] 集成到顶部 AI 菜单

### Phase 4: 测试和优化 (2天)
- [ ] 单元测试
- [ ] 集成测试
- [ ] 性能优化
- [ ] 错误处理完善

## 风险识别

| 风险 | 可能性 | 影响 | 应对措施 |
|------|--------|------|----------|
| **Playwright 打包体积大** | 高 | 中 | ✅ **随 App 打包** (已确认)，增加 ~150MB |
| **Python 沙箱安全问题** | 中 | 高 | ✅ **禁用 os/sys，保留缓存** (已确认) |
| **arXiv API 限流** | 低 | 低 | 实现缓存机制 |
| **Token 计数准确性** | 中 | 中 | 使用 tiktoken 验证 |
| **主进程阻塞** | 中 | 中 | 异步执行，进程隔离 |

### Python 沙箱安全措施

| 措施 | 状态 |
|------|------|
| 超时控制 (默认 30 秒) | ✅ 已实现 |
| 输出大小限制 (100KB) | ✅ 已实现 |
| 临时文件自动清理 | ✅ 已实现 |
| 禁用 os 模块 | ✅ 已实现 |
| 禁用 sys 模块 | ✅ 已实现 |
| 禁用 subprocess, shutil | ✅ 已实现 |
| 禁用 pickle, marshal | ✅ 已实现 |
| **允许缓存写入** | ✅ **已确认** |

### 缓存目录

```
~/.tashanstone/deep-research/cache/
├── cache_173XXXXX_1.json  # 中间结果缓存
├── cache_173XXXXX_2.json
└── ...
```

## 依赖项

```json
{
  "dependencies": {
    "playwright": "^1.40.0",           // ✅ 随 App 打包
    "xml2js": "^0.6.2",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "@types/xml2js": "^0.4.14",
    "@types/uuid": "^9.0.7"
  }
}
```

### Playwright 打包配置

```typescript
// electron-builder.yml 添加
extraResources:
  - from: node_modules/playwright/.local-browsers
    to: playwright-browsers
    filter:
      - "**/*"

build:
  extraFiles:
    - from: node_modules/playwright
      to: app/playwright
      filter:
        - "**/*.js"
        - "**/*.locales"
        - "**/*.manifest"
```

### 安装包体积预估

| 组件 | 体积 |
|------|------|
| Playwright Chromium | ~150MB |
| 应用本体 | ~80MB |
| OCR 模型 | ~100MB |
| 语音模型 | ~50MB |
| **总计** | **~380MB** |

## 验收标准

### 1. 功能完整性
- [ ] 顶部 AI 菜单包含"深度研究"入口
- [ ] 点击打开独立的深度研究页面
- [ ] Web 搜索功能正常
- [ ] 页面读取功能正常
- [ ] arXiv 搜索功能正常
- [ ] PDF 解析功能正常
- [ ] Python 代码执行功能正常 (禁用 os/sys，保留缓存)

### 2. 用户体验 (类似语音转录页面)
- [ ] 左侧显示研究历史
- [ ] 右侧主区域包含输入框和开始按钮
- [ ] 研究过程中显示进度指示
- [ ] 支持取消研究操作
- [ ] 研究完成后显示完整答案
- [ ] 结果自动保存到历史记录
- [ ] 支持清空历史记录

### 3. 性能要求
- [ ] 页面加载 < 2秒
- [ ] 搜索响应 < 5秒
- [ ] Python 执行 < 30秒
- [ ] 内存占用 < 500MB (不含 Playwright)

### 4. 安全性
- [ ] Python 沙箱禁用 os/sys/subprocess/shutil
- [ ] Python 沙箱支持缓存写入
- [ ] 超时控制正常工作
- [ ] 输出大小限制有效

### 5. 代码质量
- [ ] 类型覆盖率 > 90%
- [ ] 单元测试覆盖率 > 70%
- [ ] ESLint 通过
- [ ] 文档完整

## 参考资源

- DeepResearch 官方仓库: https://github.com/Alibaba-NLP/DeepResearch
- DeepWiki 文档: https://deepwiki.com/Alibaba-NLP/DeepResearch
- Playwright 官方文档: https://playwright.dev/docs/intro
- arXiv API 文档: https://arxiv.org/help/api
- PDF.js 文档: https://mozilla.github.io/pdf.js/
