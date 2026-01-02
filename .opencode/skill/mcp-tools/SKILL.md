---
name: mcp-tools
description: MCP (Model Context Protocol) 工具协议集成，包括 MCP 服务器配置、工具调用、状态管理
---

# MCP 工具协议开发规范

## 触发条件

- **关键词**：MCP、工具、协议、server、client、Model Context Protocol
- **场景**：配置 MCP 服务器、实现工具调用、集成外部服务

## 核心规范

### MCP 架构

```
┌─────────────────────────────────────────────────┐
│              渲染进程 (React)                   │
│  ┌─────────────────────────────────────────┐   │
│  │          mcpService.ts                  │   │
│  │  - loadConfig() 加载配置                │   │
│  │  - getTools()   获取工具列表            │   │
│  │  - callTool()   调用工具                │   │
│  │  - getStatuses() 获取服务器状态         │   │
│  └─────────────────────────────────────────┘   │
│                     │ IPC                      │
└─────────────────────┼──────────────────────────┘
                      ▼
┌─────────────────────────────────────────────────┐
│              主进程 (Electron)                  │
│  ┌─────────────────────────────────────────┐   │
│  │         electron/mcp/index.ts           │   │
│  │  - MCPManager 服务器管理                │   │
│  │  - 连接/断开服务器                       │   │
│  │  - 工具路由                             │   │
│  └─────────────────────────────────────────┘   │
│                     │ JSON-RPC over stdio      │
└─────────────────────┼──────────────────────────┘
                      ▼
┌─────────────────────────────────────────────────┐
│              MCP 服务器进程                      │
│  ┌─────────────────────────────────────────┐   │
│  │  npx @modelcontextprotocol/server-*     │   │
│  │  chrome-devtools-mcp                     │   │
│  │  或自定义服务器                          │   │
│  └─────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

### MCP 服务实现

```typescript
// src/services/mcpService.ts
interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
}

interface MCPServerStatus {
  name: string;
  status: string;
  tools: MCPTool[];
  error?: string;
}

class MCPService {
  private isElectronEnv: boolean | null = null;

  isAvailable(): boolean {
    return typeof window !== 'undefined' &&
      window.electronAPI !== undefined &&
      window.electronAPI.mcp !== undefined;
  }

  async getTools(): Promise<MCPTool[]> {
    if (!this.isAvailable()) return [];
    return window.electronAPI.mcp.getTools() as MCPTool[];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<{
    success: boolean;
    result?: any;
    error?: string;
  }> {
    if (!this.isAvailable()) {
      return { success: false, error: 'MCP not available' };
    }
    return window.electronAPI.mcp.callTool(name, args);
  }

  async getStatuses(): Promise<MCPServerStatus[]> {
    if (!this.isAvailable()) return [];
    return window.electronAPI.mcp.getStatuses() as MCPServerStatus[];
  }
}

export const mcpService = new MCPService();
```

### MCP 服务器配置

```json
// opencode.json
{
  "mcpServers": {
    "chrome-devtools": {
      "type": "local",
      "enabled": true,
      "command": ["npx", "-y", "chrome-devtools-mcp@latest"]
    },
    "filesystem": {
      "type": "local",
      "command": ["npx", "-y", "@modelcontextprotocol/server-filesystem"],
      "args": ["/path/to/directory"]
    },
    "custom-server": {
      "type": "local",
      "command": ["python", "path/to/mcp_server.py"],
      "env": {
        "API_KEY": "your-api-key"
      }
    }
  }
}
```

### MCP 客户端实现

```typescript
// electron/mcp/MCPClient.ts
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/index.js';

interface MCPRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

export class MCPClient {
  private transport: StdioClientTransport | null = null;
  private requestId: number = 0;
  private pendingRequests: Map<number, { resolve: Function; reject: Function }> = new Map();

  async connect(command: string, args: string[], env?: Record<string, string>): Promise<void> {
    this.transport = new StdioClientTransport({
      command,
      args,
      env: { ...process.env, ...env }
    });

    this.transport.onmessage = (message: MCPRequest) => {
      if (message.id && this.pendingRequests.has(message.id)) {
        const { resolve, reject } = this.pendingRequests.get(message.id)!;
        if (message.error) {
          reject(new Error(message.error.message));
        } else {
          resolve(message.result);
        }
        this.pendingRequests.delete(message.id);
      }
    };

    await this.transport.start();
  }

  async callTool(name: string, arguments_: Record<string, unknown>): Promise<any> {
    const id = ++this.requestId;
    const promise = new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
    });

    await this.transport?.send({
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: { name, arguments: arguments_ }
    });

    return promise;
  }

  async disconnect(): Promise<void> {
    await this.transport?.close();
    this.transport = null;
  }
}
```

## 禁止事项

- ❌ 禁止在配置中硬编码敏感信息（使用环境变量）
- ❌ 禁止信任未验证的 MCP 服务器输出
- ❌ 禁止忽略 MCP 服务器连接错误
- ❌ 禁止在生产环境使用无权限控制的 MCP 服务器

## 推荐模式

1. **服务器隔离**：每个 MCP 服务器运行在独立进程
2. **超时控制**：设置合理的请求和连接超时
3. **错误处理**：优雅处理服务器崩溃和重连
4. **工具验证**：验证工具输入参数结构

## 参考代码

| 文件 | 说明 |
|------|------|
| `src/services/mcpService.ts` | 渲染进程 MCP 服务 |
| `electron/mcp/index.ts` | MCP 管理器 |
| `electron/mcp/MCPClient.ts` | MCP 客户端 |
| `electron/mcp/handlers.ts` | IPC 处理器 |
| `electron/mcp/types.ts` | 类型定义 |
| `docs/mcp-config-example.json` | 配置示例 |
| `docs/utils/MCP_USAGE.md` | 使用文档 |
