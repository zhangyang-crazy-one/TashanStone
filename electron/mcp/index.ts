import { MCPClient } from './MCPClient.js';
import { logger } from '../utils/logger.js';
import type {
    MCPConfig,
    MCPTool,
    MCPServerStatus
} from './types.js';

/**
 * MCP 管理器 - 单例模式
 * 管理多个 MCP 服务器连接
 */
class MCPManager {
    private static instance: MCPManager | null = null;
    private clients: Map<string, MCPClient> = new Map();
    private toolToServerMap: Map<string, string> = new Map();
    private isInitialized = false;
    private initializationPromise: Promise<void> | null = null;

    private constructor() {
        logger.info('MCPManager initialized');
    }

    /**
     * 获取单例实例
     */
    static getInstance(): MCPManager {
        if (!MCPManager.instance) {
            MCPManager.instance = new MCPManager();
        }
        return MCPManager.instance;
    }

    /**
     * 检查是否已初始化
     */
    isReady(): boolean {
        return this.isInitialized && this.toolToServerMap.size > 0;
    }

    /**
     * 等待初始化完成
     */
    async waitForInitialization(timeoutMs: number = 5000): Promise<boolean> {
        if (this.isInitialized && this.toolToServerMap.size > 0) {
            return true;
        }

        if (this.initializationPromise) {
            try {
                await Promise.race([
                    this.initializationPromise,
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Initialization timeout')), timeoutMs)
                    )
                ]);
                return this.isInitialized && this.toolToServerMap.size > 0;
            } catch (error) {
                logger.warn('Waiting for MCP initialization timeout or failed', error);
                return false;
            }
        }

        return false;
    }

    /**
     * 加载配置并连接所有服务器
     */
    async loadConfig(configStr: string): Promise<void> {
        // 如果已经在初始化中,等待完成
        if (this.initializationPromise) {
            return this.initializationPromise;
        }

        this.initializationPromise = this._loadConfigInternal(configStr);
        return this.initializationPromise;
    }

    private async _loadConfigInternal(configStr: string): Promise<void> {
        try {
            const config: MCPConfig = JSON.parse(configStr);

            if (!config.mcpServers || typeof config.mcpServers !== 'object') {
                throw new Error('Invalid MCP config: missing mcpServers');
            }

            logger.info('Loading MCP config', {
                serversCount: Object.keys(config.mcpServers).length
            });

            // 断开现有连接
            await this.disconnectAll();

            // 连接所有服务器
            const connectionPromises = Object.entries(config.mcpServers).map(
                async ([name, serverConfig]) => {
                    try {
                        const client = new MCPClient(name, serverConfig);
                        await client.connect();
                        this.clients.set(name, client);

                        // 建立工具到服务器的映射
                        const tools = client.getTools();
                        for (const tool of tools) {
                            if (this.toolToServerMap.has(tool.name)) {
                                logger.warn(`Tool name conflict: ${tool.name} exists in multiple servers`);
                            }
                            this.toolToServerMap.set(tool.name, name);
                        }

                        logger.info(`MCP server '${name}' connected with ${tools.length} tools`);

                        return { name, success: true };
                    } catch (error) {
                        logger.error(`Failed to connect to MCP server ${name}:`, error);
                        return {
                            name,
                            success: false,
                            error: error instanceof Error ? error.message : 'Unknown error'
                        };
                    }
                }
            );

            const results = await Promise.all(connectionPromises);

            const successCount = results.filter(r => r.success).length;
            const failCount = results.length - successCount;

            logger.info('MCP servers connection completed', {
                total: results.length,
                success: successCount,
                failed: failCount,
                totalTools: this.toolToServerMap.size
            });

            if (failCount > 0) {
                const failedServers = results
                    .filter(r => !r.success)
                    .map(r => `${r.name}: ${(r as any).error}`)
                    .join('; ');
                logger.warn('Some MCP servers failed to connect:', failedServers);
            }

            // 标记为已初始化
            this.isInitialized = true;

            // 打印工具映射表用于调试
            logger.debug('Tool to server mapping:',
                Array.from(this.toolToServerMap.entries()).map(([tool, server]) => `${tool} -> ${server}`)
            );

        } catch (error) {
            logger.error('Failed to load MCP config:', error);
            this.isInitialized = false;
            this.initializationPromise = null;
            throw new Error(`Failed to load MCP config: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * 获取所有工具
     */
    getAllTools(): MCPTool[] {
        const allTools: MCPTool[] = [];

        for (const client of this.clients.values()) {
            if (client.isConnected()) {
                allTools.push(...client.getTools());
            }
        }

        logger.debug('getAllTools called', { count: allTools.length });
        return allTools;
    }

    /**
     * 调用工具
     */
    async callTool(name: string, args: any): Promise<any> {
        // 如果尚未初始化完成,等待一下
        if (!this.isReady()) {
            logger.warn(`Tool mapping not ready, waiting for initialization...`);
            const ready = await this.waitForInitialization(3000);
            if (!ready) {
                const availableTools = Array.from(this.toolToServerMap.keys());
                throw new Error(
                    `MCP not ready. Tool '${name}' not found. Available tools: ${availableTools.length > 0 ? availableTools.join(', ') : 'none'}`
                );
            }
        }

        const serverName = this.toolToServerMap.get(name);

        if (!serverName) {
            const availableTools = Array.from(this.toolToServerMap.keys());
            const suggestion = availableTools.length > 0
                ? `Available tools: ${availableTools.join(', ')}`
                : 'No tools available. Check MCP server configuration.';

            throw new Error(`Tool not found: ${name}. ${suggestion}`);
        }

        const client = this.clients.get(serverName);

        if (!client || !client.isConnected()) {
            throw new Error(`MCP server ${serverName} not connected`);
        }

        logger.info(`Calling MCP tool: ${name}`, { server: serverName, args });

        try {
            const result = await client.callTool(name, args);
            logger.debug(`Tool call result for ${name}:`, result);
            return result;
        } catch (error) {
            logger.error(`Tool call failed for ${name}:`, error);
            throw error;
        }
    }

    /**
     * 获取所有服务器状态
     */
    getStatuses(): MCPServerStatus[] {
        const statuses: MCPServerStatus[] = [];

        for (const [name, client] of this.clients.entries()) {
            statuses.push({
                name,
                status: client.isConnected() ? 'running' : 'stopped',
                tools: client.getTools(),
                error: undefined
            });
        }

        return statuses;
    }

    /**
     * 断开所有连接
     */
    async disconnectAll(): Promise<void> {
        logger.info('Disconnecting all MCP servers');

        const disconnectPromises = Array.from(this.clients.values()).map(
            client => client.disconnect().catch(error => {
                logger.error(`Error disconnecting ${client.getName()}:`, error);
            })
        );

        await Promise.all(disconnectPromises);

        this.clients.clear();
        this.toolToServerMap.clear();

        logger.info('All MCP servers disconnected');
    }

    /**
     * 断开指定服务器
     */
    async disconnectServer(name: string): Promise<void> {
        const client = this.clients.get(name);

        if (!client) {
            logger.warn(`MCP server ${name} not found`);
            return;
        }

        await client.disconnect();

        // 移除工具映射
        const tools = client.getTools();
        for (const tool of tools) {
            this.toolToServerMap.delete(tool.name);
        }

        this.clients.delete(name);

        logger.info(`MCP server ${name} disconnected`);
    }

    /**
     * 检查是否有活动连接
     */
    hasActiveConnections(): boolean {
        return Array.from(this.clients.values()).some(client => client.isConnected());
    }

    /**
     * 获取已连接的服务器数量
     */
    getConnectedCount(): number {
        return Array.from(this.clients.values()).filter(client => client.isConnected()).length;
    }
}

// 导出单例
export const mcpManager = MCPManager.getInstance();
