/**
 * 渲染进程 MCP 服务
 * 封装 Electron IPC 调用，提供统一的 MCP 接口
 */

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
    private _isElectronEnv: boolean | null = null;

    /**
     * 动态检测 Electron 环境
     * 避免在模块加载时 electronAPI 尚未就绪的问题
     */
    private get isElectronEnv(): boolean {
        // 每次都重新检测，因为 electronAPI 可能在模块加载后才可用
        if (typeof window !== 'undefined' &&
            window.electronAPI !== undefined &&
            window.electronAPI.mcp !== undefined) {
            this._isElectronEnv = true;
            return true;
        }
        // 如果已经确认过是 Electron 环境，直接返回 true
        if (this._isElectronEnv === true) {
            return true;
        }
        return false;
    }

    /**
     * 检查是否可用
     */
    isAvailable(): boolean {
        return this.isElectronEnv;
    }

    /**
     * 加载 MCP 配置
     */
    async loadConfig(configStr: string): Promise<{ success: boolean; error?: string }> {
        if (!this.isElectronEnv) {
            return {
                success: false,
                error: 'MCP not available in browser environment'
            };
        }

        try {
            const result = await window.electronAPI.mcp.loadConfig(configStr);
            return result;
        } catch (error) {
            console.error('MCPService.loadConfig failed:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    /**
     * 获取所有可用工具
     */
    async getTools(): Promise<MCPTool[]> {
        if (!this.isElectronEnv) {
            console.warn('MCP not available in browser environment');
            return [];
        }

        try {
            const tools = await window.electronAPI.mcp.getTools();
            // Use type assertion since preload types may differ slightly from our interface
            return tools as MCPTool[];
        } catch (error) {
            console.error('MCPService.getTools failed:', error);
            return [];
        }
    }

    /**
     * 调用工具
     */
    async callTool(name: string, args: any): Promise<{ success: boolean; result?: any; error?: string }> {
        if (!this.isElectronEnv) {
            return {
                success: false,
                error: 'MCP not available in browser environment'
            };
        }

        try {
            const result = await window.electronAPI.mcp.callTool(name, args);
            return result;
        } catch (error) {
            console.error('MCPService.callTool failed:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    /**
     * 获取服务器状态
     */
    async getStatuses(): Promise<MCPServerStatus[]> {
        if (!this.isElectronEnv) {
            console.warn('MCP not available in browser environment');
            return [];
        }

        try {
            const statuses = await window.electronAPI.mcp.getStatuses();
            // Use type assertion since preload types may differ slightly from our interface
            return statuses as unknown as MCPServerStatus[];
        } catch (error) {
            console.error('MCPService.getStatuses failed:', error);
            return [];
        }
    }

    /**
     * 断开所有连接
     */
    async disconnectAll(): Promise<{ success: boolean; error?: string }> {
        if (!this.isElectronEnv) {
            return {
                success: false,
                error: 'MCP not available in browser environment'
            };
        }

        try {
            const result = await window.electronAPI.mcp.disconnectAll();
            return result;
        } catch (error) {
            console.error('MCPService.disconnectAll failed:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
}

// 导出单例
export const mcpService = new MCPService();
