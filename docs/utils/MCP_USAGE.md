# MCP (Model Context Protocol) 集成使用文档

## 概述

本项目已实现完整的 MCP 客户端，允许 AI 通过真正的 MCP 服务器获取工具能力。

## 架构

```
渲染进程 (React)
    ↓
src/services/mcpService.ts (封装 IPC 调用)
    ↓ IPC
electron/mcp/handlers.ts (IPC 处理器)
    ↓
electron/mcp/index.ts (MCP 管理器)
    ↓
electron/mcp/MCPClient.ts (单个服务器客户端)
    ↓ JSON-RPC over stdio
MCP 服务器进程 (外部进程)
```

## 配置格式

MCP 配置使用 JSON 格式：

```json
{
  "mcpServers": {
    "服务器名称": {
      "command": "启动命令",
      "args": ["参数1", "参数2"],
      "env": {
        "环境变量": "值"
      },
      "cwd": "工作目录（可选）"
    }
  }
}
```

## 配置示例

### 1. Chrome DevTools MCP 服务器

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-chrome-devtools"
      ]
    }
  }
}
```

### 2. Filesystem MCP 服务器

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "C:\\Users\\YourName\\Documents"
      ]
    }
  }
}
```

### 3. 多服务器配置

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-chrome-devtools"]
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/directory"]
    },
    "custom-python": {
      "command": "python",
      "args": ["path/to/your/mcp_server.py"],
      "env": {
        "API_KEY": "your-api-key"
      }
    }
  }
}
```

## 在应用中使用

### 1. 通过 AI 配置界面

在 AI 配置对话框中，找到 "MCP Tools" 文本框，粘贴配置 JSON：

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-chrome-devtools"]
    }
  }
}
```

保存配置后，MCP 服务器会在下次 AI 请求时自动连接。

### 2. 验证连接状态

查看开发者控制台，应该看到：

```
[MCP] Starting server 'chrome-devtools' with command: npx -y @modelcontextprotocol/server-chrome-devtools
[MCP] Connected to 1 servers.
[AI] Using Real MCP Client (Electron)
```

### 3. AI 自动调用工具

AI 会自动发现可用工具并在需要时调用：

```
用户: "帮我打开浏览器查看这个网页"
AI: [调用 chrome-devtools 的 navigate 工具]
```

## 工具调用流程

1. **工具发现**：AI 请求时，系统自动获取所有 MCP 服务器的工具列表
2. **工具选择**：AI 根据用户需求选择合适的工具
3. **工具调用**：通过 JSON-RPC 2.0 协议发送请求到 MCP 服务器
4. **结果返回**：MCP 服务器执行工具并返回结果
5. **AI 响应**：AI 根据工具结果生成最终回复

## 支持的 MCP 服务器

### 官方服务器

1. **@modelcontextprotocol/server-chrome-devtools**
   - 工具：浏览器控制、页面快照、元素操作
   - 用途：自动化网页测试、数据抓取

2. **@modelcontextprotocol/server-filesystem**
   - 工具：文件读写、目录浏览
   - 用途：文件管理、代码生成

3. **@modelcontextprotocol/server-git**
   - 工具：Git 操作
   - 用途：版本控制

4. **@modelcontextprotocol/server-github**
   - 工具：GitHub API 调用
   - 用途：仓库管理、Issue 处理

### 自定义服务器

你可以创建自己的 MCP 服务器：

```python
# mcp_server.py
import json
import sys

def handle_request(request):
    if request['method'] == 'tools/list':
        return {
            'tools': [
                {
                    'name': 'custom_tool',
                    'description': '自定义工具',
                    'inputSchema': {
                        'type': 'object',
                        'properties': {
                            'param': {'type': 'string'}
                        }
                    }
                }
            ]
        }
    # ...

while True:
    line = sys.stdin.readline()
    if not line:
        break
    request = json.loads(line)
    response = handle_request(request)
    print(json.dumps(response))
    sys.stdout.flush()
```

## 故障排除

### 问题 1：服务器无法启动

**错误**：`MCP server startup timeout`

**解决方案**：
- 检查 `command` 和 `args` 是否正确
- 确保依赖已安装 (`npx` 会自动安装)
- 检查防火墙设置

### 问题 2：工具调用失败

**错误**：`Tool not found`

**解决方案**：
- 检查服务器是否成功连接
- 查看开发者控制台确认工具列表
- 验证工具名称拼写

### 问题 3：环境变量未生效

**解决方案**：
- 在配置中明确指定 `env` 字段
- 重启应用以重新加载配置

## 最佳实践

1. **逐个测试**：先配置单个服务器，确认可用后再添加更多
2. **查看日志**：开启开发者工具查看详细日志
3. **处理错误**：AI 会自动处理工具调用失败，无需手动干预
4. **性能考虑**：过多服务器会增加启动时间，按需配置

## 技术细节

### JSON-RPC 2.0 协议

所有通信使用 JSON-RPC 2.0 over stdio：

**请求示例**：
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "navigate_page",
    "arguments": {
      "url": "https://example.com"
    }
  }
}
```

**响应示例**：
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {"type": "text", "text": "Navigated successfully"}
    ]
  }
}
```

### 超时设置

- **启动超时**：10 秒
- **请求超时**：30 秒
- **初始化超时**：由各服务器决定

### 并发处理

- 每个服务器运行在独立进程
- 工具调用按顺序执行（避免竞态条件）
- 多服务器可并行运行

## 安全注意事项

1. **路径访问**：Filesystem 服务器只能访问配置的目录
2. **环境变量**：避免在配置中硬编码敏感信息
3. **进程隔离**：每个 MCP 服务器在沙箱进程中运行
4. **输入验证**：所有工具参数会被验证

## 未来扩展

- [ ] 支持远程 MCP 服务器（HTTP/WebSocket）
- [ ] 工具调用历史记录
- [ ] 服务器健康检查和自动重启
- [ ] 工具权限管理
- [ ] 流式工具输出

## 参考资源

- [MCP 官方文档](https://modelcontextprotocol.io/)
- [MCP GitHub 仓库](https://github.com/modelcontextprotocol)
- [可用 MCP 服务器列表](https://github.com/modelcontextprotocol/servers)
