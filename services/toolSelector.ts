/**
 * 智能工具分析器
 *
 * 设计理念：只分析，不过滤
 * - 意图识别：了解用户想做什么
 * - 工具评分：推荐最相关的工具（仅供参考）
 * - 全部传递：所有工具都会传递给 AI，让 AI 自己选择
 *
 * 为什么？因为 MCP 工具本身有描述，AI 比客户端更懂该用什么工具
 */

/**
 * 通用工具接口，适配不同提供商的工具类型
 */
export interface GenericTool {
  name?: string;
  description?: string;
  parameters?: unknown;
  inputSchema?: unknown;
}

/**
 * 工具分析结果
 */
export interface ToolAnalysisResult {
  intent: IntentType;
  query: string;
  toolsCount: number;
  recommendedTools: ToolMatch[];
  estimatedTokens: number;
}

/**
 * 工具匹配结果
 */
export interface ToolMatch<T extends GenericTool = GenericTool> {
  tool: T;
  score: number;
  matchedKeywords: string[];
}

/**
 * 意图类型
 */
export type IntentType =
  | 'file_operation'    // 文件操作: 读取、写入、搜索文件
  | 'navigation'        // 导航: 打开网页、截图、点击
  | 'search'            // 搜索: 网络搜索、知识库搜索
  | 'code'              // 代码: 编程、调试
  | 'calculation'       // 计算: 数学计算
  | 'analysis'          // 分析: 数据分析、内容分析
  | 'unknown';          // 未知

/**
 * 智能工具分析器
 */
export class ToolAnalyzer<T extends GenericTool = GenericTool> {
  /**
   * 分析查询并返回分析结果（仅供参考，不影响工具传递）
   */
  analyze(tools: T[], userQuery: string): ToolAnalysisResult {
    const intent = this.analyzeIntent(userQuery);
    const matches = tools.map(tool => ({
      tool,
      score: this.calculateScore(tool, userQuery, intent),
      matchedKeywords: this.findMatchedKeywords(tool, userQuery)
    }));

    // 按分数排序
    matches.sort((a, b) => b.score - a.score);

    // 日志输出
    this.logAnalysis(userQuery, intent, matches, tools.length);

    return {
      intent,
      query: userQuery,
      toolsCount: tools.length,
      recommendedTools: matches.slice(0, 5),  // Top 5 推荐
      estimatedTokens: this.estimateTotalTokens(tools)
    };
  }

  /**
    * 根据意图选择工具（非工具操作意图返回空数组）
    */
  selectByIntent(tools: T[], intent: IntentType): T[] {
    // 对于不需要工具的意图，返回空数组以减少上下文开销
    const noToolIntents: IntentType[] = ['analysis', 'unknown', 'calculation'];
    if (noToolIntents.includes(intent)) {
      return [];
    }
    // 其他意图返回所有工具（让 AI 自己选择）
    return tools;
  }

  /**
   * 分析并返回要传递的工具
   */
  analyzeAndSelect(tools: T[], userQuery: string): { result: ToolAnalysisResult; tools: T[] } {
    const result = this.analyze(tools, userQuery);
    const selectedTools = this.selectByIntent(tools, result.intent);
    return { result, tools: selectedTools };
  }

  /**
    * 日志输出
    */
  private logAnalysis(
    query: string,
    intent: IntentType,
    matches: ToolMatch<T>[],
    totalCount: number,
    actualToolsCount: number = totalCount
  ): void {
    console.log(`[ToolAnalyzer] 分析查询: "${query.substring(0, 50)}..."`);
    console.log(`[ToolAnalyzer] 意图识别: ${intent}`);
    if (actualToolsCount === totalCount) {
      console.log(`[ToolAnalyzer] 传递工具: ${actualToolsCount} 个 (全部)`);
    } else {
      console.log(`[ToolAnalyzer] 传递工具: ${actualToolsCount} 个 (根据意图筛选)`);
    }

    // 显示推荐工具
    if (matches.length > 0) {
      console.log(`[ToolAnalyzer] 推荐工具 (仅供参考):`);
      matches.slice(0, 5).forEach((m, i) => {
        console.log(`  ${i + 1}. ${m.tool.name} (score: ${m.score.toFixed(2)})`);
      });
    }
  }

  /**
   * 分析用户查询意图（扩展中文关键词，使用单词边界匹配避免误匹配）
   */
  private analyzeIntent(query: string): IntentType {
    const lowerQuery = query.toLowerCase();

    // 使用单词边界匹配，避免 "conversation" 被 "open" 误匹配
    const hasKeyword = (keywords: string[]): boolean => {
      return keywords.some(kw => {
        // 对 "go to" 这种多词关键词使用特殊处理
        if (kw.includes(' ')) {
          return lowerQuery.includes(kw);
        }
        // 中文关键词不使用单词边界
        if (/[\u4e00-\u9fa5]/.test(kw)) {
          return lowerQuery.includes(kw);
        }
        // 使用单词边界正则进行精确匹配
        return new RegExp(`\\b${kw}\\b`, 'i').test(lowerQuery);
      });
    };

    // 代码关键词 (优先检查，避免 "code" 被误匹配为 file_operation)
    const codeKeywords = [
      'code', 'program', 'function', 'class', 'debug', 'implement', 'api', 'javascript', 'python',
      '代码', '编程', '函数', '调试', '程序'
    ];
    const matchedCodeKw = codeKeywords.filter(kw => {
      if (kw.includes(' ')) return lowerQuery.includes(kw);
      if (/[\u4e00-\u9fa5]/.test(kw)) return lowerQuery.includes(kw);
      return new RegExp(`\\b${kw}\\b`, 'i').test(lowerQuery);
    });
    console.log(`[ToolAnalyzer DEBUG] codeKeywords matched: ${JSON.stringify(matchedCodeKw)}`);
    if (matchedCodeKw.length > 0) {
      return 'code';
    }

    // 分析关键词 (优先检查，避免 "summarize conversation" 被误匹配为 navigation)
    const analysisKeywords = [
      'analyze', 'summary', 'summarize', 'extract', 'compare', 'evaluate',
      'analyse', 'summarise',  // 支持英式拼写
      '分析', '总结', '提取', '比较', '评估', '摘要', '归纳'
    ];
    const matchedAnalysisKw = analysisKeywords.filter(kw => {
      if (kw.includes(' ')) return lowerQuery.includes(kw);
      if (/[\u4e00-\u9fa5]/.test(kw)) return lowerQuery.includes(kw);
      return new RegExp(`\\b${kw}\\b`, 'i').test(lowerQuery);
    });
    console.log(`[ToolAnalyzer DEBUG] analysisKeywords matched: ${JSON.stringify(matchedAnalysisKw)}`);
    if (matchedAnalysisKw.length > 0) {
      return 'analysis';
    }

    // 计算关键词
    const calcKeywords = [
      'calculate', 'compute', 'math', 'sum', 'average', 'percentage', 'convert',
      '计算', '数学', '求和', '平均', '百分比'
    ];
    if (hasKeyword(calcKeywords)) {
      return 'calculation';
    }

    // 导航关键词 (移到最后，避免与 analysis 冲突)
    const navKeywords = [
      'navigate', 'page', 'go to', 'visit', 'browse',
      '导航', '网页', '浏览', '访问', '跳转',
      'click', 'screenshot', '截图', '点击'
    ];
    // 注意：移除了 'open' 以避免与 "open conversation" 等误匹配
    // 如果需要打开功能，请使用 "navigate to" 或 "visit"
    if (hasKeyword(navKeywords)) {
      return 'navigation';
    }

    // 文件操作关键词
    const fileKeywords = [
      'file', 'read', 'write', 'edit', 'delete', 'create', 'save', 'path', 'folder', 'directory',
      '文件', '读取', '写入', '编辑', '删除', '创建', '打开', '保存', '路径', '文件夹'
    ];
    if (hasKeyword(fileKeywords)) {
      return 'file_operation';
    }

    // 搜索关键词
    const searchKeywords = [
      'search', 'find', 'look', 'query', 'lookup', 'searching',
      '搜索', '查找', '查询', '找'
    ];
    if (hasKeyword(searchKeywords)) {
      return 'search';
    }

    return 'unknown';
  }

  /**
   * 计算工具匹配分数
   */
  private calculateScore(tool: T, query: string, intent: IntentType): number {
    const lowerQuery = query.toLowerCase();
    const toolName = (tool.name || '').toLowerCase();
    const toolDesc = (tool.description || '').toLowerCase();

    let score = 0;

    // 工具名称匹配 (高权重)
    if (toolName.includes(lowerQuery) || lowerQuery.includes(toolName)) {
      score += 0.5;
    }

    // 工具描述关键词匹配
    const descKeywords = this.extractKeywords(lowerQuery);
    const toolKeywords = this.extractKeywords(toolDesc);
    const matchedDesc = descKeywords.filter(kw => toolKeywords.includes(kw));
    score += matchedDesc.length * 0.1;

    // 意图匹配 (中权重)
    const intentKeywords: Record<IntentType, string[]> = {
      'navigation': ['navigate', 'open', 'page', 'go', 'visit', 'browse', 'click', 'screenshot'],
      'file_operation': ['file', 'read', 'write', 'edit', 'delete', 'create', 'path', 'folder'],
      'search': ['search', 'find', 'query', 'lookup'],
      'code': ['code', 'program', 'function', 'api', 'implement'],
      'calculation': ['calculate', 'math', 'compute', 'number'],
      'analysis': ['analyze', 'summary', 'extract', 'compare'],
      'unknown': []
    };

    const relevantKeywords = intentKeywords[intent] || [];
    const intentMatches = relevantKeywords.filter(kw =>
      toolName.includes(kw) || toolDesc.includes(kw)
    );
    score += intentMatches.length * 0.2;

    // 工具参数中的关键词匹配
    const params = tool.parameters || tool.inputSchema || {};
    const paramDesc = JSON.stringify(params).toLowerCase();
    const paramMatches = descKeywords.filter(kw => paramDesc.includes(kw));
    score += paramMatches.length * 0.05;

    return Math.min(score, 1);
  }

  /**
   * 查找匹配的关键词
   */
  private findMatchedKeywords(tool: T, query: string): string[] {
    const lowerQuery = query.toLowerCase();
    const toolText = `${tool.name} ${tool.description}`.toLowerCase();
    const queryKeywords = this.extractKeywords(lowerQuery);

    return queryKeywords.filter(kw =>
      kw.length > 2 && toolText.includes(kw)
    );
  }

  /**
   * 提取关键词
   */
  private extractKeywords(text: string): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
      'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
      'into', 'through', 'during', 'before', 'after', 'above', 'below',
      'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'him', 'his',
      'she', 'her', 'it', 'its', 'they', 'them', 'their', 'what', 'which',
      'who', 'whom', 'this', 'that', 'these', 'those', 'and', 'but', 'or',
      'if', 'because', 'until', 'while', 'although', 'though', 'after',
      'just', 'now', 'here', 'there', 'when', 'where', 'why', 'how',
      '请', '帮', '我', '你', '他', '她', '它', '们', '的', '是', '在',
      '有', '和', '与', '对', '为', '了', '把', '被', '让', '给'
    ]);

    const words = text
      .replace(/[^\w\s\u4e00-\u9fa5]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 3 && !stopWords.has(w.toLowerCase()));

    return [...new Set(words)];
  }

  /**
   * 估算工具的 Token 消耗
   */
  estimateToolTokens(tool: T): number {
    const params = tool.parameters || tool.inputSchema || {};
    const chineseChar = (text: string) => (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const otherChar = (text: string) => text.length - chineseChar(text);

    const tokens = Math.ceil(
      chineseChar((tool.name || '') + (tool.description || '') + JSON.stringify(params)) * 0.25 +
      otherChar((tool.name || '') + (tool.description || '') + JSON.stringify(params)) * 0.5
    );

    return Math.max(tokens, 100);
  }

  /**
   * 估算工具列表的总 Token 消耗
   */
  estimateTotalTokens(tools: T[]): number {
    return tools.reduce((total, tool) => total + this.estimateToolTokens(tool), 0);
  }
}

/**
 * 创建工具分析器实例
 */
export function createToolAnalyzer<T extends GenericTool = GenericTool>(): ToolAnalyzer<T> {
  return new ToolAnalyzer<T>();
}
